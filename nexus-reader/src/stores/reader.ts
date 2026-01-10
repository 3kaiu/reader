import { defineStore } from 'pinia'
import { computed } from 'vue'
import { type Book } from '../api'
import { logger } from '../utils/logger'
import { useReaderContentStore } from './reader/content'
import { useReaderUIStore } from './reader/ui'
import { useReaderNavigationStore } from './reader/navigation'
import { createErrorHandler } from '../utils/errorHandler'

export const useReaderStore = defineStore('reader', () => {
  // 使用分离的子stores
  const contentStore = useReaderContentStore()
  const uiStore = useReaderUIStore()
  const navigationStore = useReaderNavigationStore()
  
  // 创建错误处理器
  const errorHandler = createErrorHandler({ component: 'ReaderStore' })

  // 代理主要状态到子stores
  const currentBook = computed(() => navigationStore.currentBook)
  const catalog = computed(() => navigationStore.catalog)
  const currentChapterIndex = computed(() => navigationStore.currentChapterIndex)
  const content = computed(() => contentStore.content)
  const formattedContent = computed(() => contentStore.formattedContent)
  const isLoading = computed(() => uiStore.isLoading)
  const isParsing = computed(() => contentStore.isParsing)
  const isLoadingMore = computed(() => uiStore.isLoadingMore)
  const error = computed(() => uiStore.error)
  const contentIssue = computed(() => contentStore.contentIssue)
  const loadError = computed(() => uiStore.loadError)
  const loadedChapters = computed(() => contentStore.loadedChapters)

  // 代理导航计算属性
  const currentChapter = computed(() => navigationStore.currentChapter)
  const totalChapters = computed(() => navigationStore.totalChapters)
  const hasNextChapter = computed(() => navigationStore.hasNextChapter)
  const hasPrevChapter = computed(() => navigationStore.hasPrevChapter)
  const progress = computed(() => navigationStore.progress)

  // 阅读指标
  const readingMetrics = computed(() => uiStore.readingMetrics)

  // 主要方法 - 委托给子stores
  async function openBook(book: Book, refresh = false) {
    const result = await errorHandler.handleAsync(async () => {
      uiStore.setLoading(true)
      uiStore.clearErrors()
      contentStore.clearCache()
      
      const success = await navigationStore.openBook(book, refresh)
      if (success) {
        await loadChapter(navigationStore.currentChapterIndex)
      }
    }, { function: 'openBook', bookId: book.id })
    
    if (!result.success) {
      uiStore.setError(result.error.userMessage)
    }
    
    uiStore.setLoading(false)
  }

  // 加载章节内容
  async function loadChapter(index: number, forceRefresh = false) {
    if (!navigationStore.currentBook || index < 0 || index >= navigationStore.catalog.length) return

    const result = await errorHandler.handleAsync(async () => {
      // 先设置导航位置
      navigationStore.goToChapter(index)
      uiStore.clearErrors()
      
      // 加载内容
      const chapterContent = await contentStore.loadChapterContent(
        navigationStore.currentBook!,
        navigationStore.catalog,
        index,
        forceRefresh
      )
      
      if (chapterContent) {
        // 保存进度和更新指标
        await navigationStore.saveProgress()
        uiStore.updateReadingMetrics(chapterContent.length)
        
        // AI索引 (后台任务)
        const runIndexing = async () => {
          try {
            const { useAIService } = await import('./ai')
            const aiStore = useAIService()
            await aiStore.indexChapter(
              navigationStore.catalog[index].title || '', 
              chapterContent, 
              index
            )
          } catch (e) { /* 忽略索引错误 */ }
        }

        if ('scheduler' in window) {
          // @ts-ignore
          window.scheduler.postTask(runIndexing, { priority: 'background' })
        } else if ('requestIdleCallback' in window) {
          window.requestIdleCallback(() => runIndexing())
        } else {
          runIndexing()
        }
      }
    }, { 
      function: 'loadChapter', 
      chapterIndex: index,
      bookId: navigationStore.currentBook?.id 
    })
    
    if (!result.success) {
      uiStore.setError(result.error.userMessage)
    }
  }

  // 导航方法
  function nextChapter() {
    if (navigationStore.nextChapter()) {
      loadChapter(navigationStore.currentChapterIndex)
    }
  }

  function prevChapter() {
    if (navigationStore.prevChapter()) {
      loadChapter(navigationStore.currentChapterIndex)
    }
  }

  async function goToChapter(index: number) {
    if (navigationStore.goToChapter(index)) {
      await loadChapter(index)
    }
  }

  // 无限滚动相关方法
  async function appendNextChapter(): Promise<boolean> {
    if (!navigationStore.currentBook || uiStore.isLoadingMore) return false

    // 找到已加载章节中最大的索引
    const maxLoadedIndex = contentStore.loadedChapters.length > 0
      ? Math.max(...contentStore.loadedChapters.map(c => c.index))
      : navigationStore.currentChapterIndex

    const nextIndex = maxLoadedIndex + 1
    if (nextIndex >= navigationStore.catalog.length) return false

    uiStore.setLoadingMore(true)

    try {
      // 重试逻辑
      const maxRetries = 3
      let lastError: any = null

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          await contentStore.appendChapterContent(
            navigationStore.currentBook,
            navigationStore.catalog,
            nextIndex
          )

          // 清除错误状态
          uiStore.setLoadError(null)
          return true
        } catch (e) {
          lastError = e
          if (attempt < maxRetries) {
            // 等待后重试
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000))
            continue
          }
        }
      }

      // 所有重试都失败了
      logger.error(`加载下一章失败，已重试${maxRetries}次`, lastError as Error, { 
        function: 'appendNextChapter',
        nextIndex,
        attempts: maxRetries
      })
      
      // 设置错误状态，供UI显示
      uiStore.setLoadError(lastError?.message || '网络连接异常，请检查网络后重试')
      return false
    } finally {
      uiStore.setLoadingMore(false)
    }
  }

  async function retryLoadNext(): Promise<boolean> {
    uiStore.setLoadError(null)
    return await appendNextChapter()
  }

  function initInfiniteScroll() {
    uiStore.setLoadError(null)
    contentStore.initInfiniteScroll(navigationStore.currentChapter)
  }

  // 跳转到指定章节（无限滚动模式优化版本）
  async function goToChapterInScroll(index: number) {
    if (index < 0 || index >= navigationStore.catalog.length) return
    
    // 检查目标章节是否已经在已加载章节中
    const targetChapter = contentStore.loadedChapters.find(ch => ch.index === index)
    
    if (targetChapter) {
      // 章节已加载，直接更新索引并滚动
      setCurrentChapterIndex(index)
    } else {
      // 章节未加载，需要重新加载
      await loadChapter(index)
      initInfiniteScroll()
    }
  }

  // 刷新相关方法
  async function reloadCurrentChapter() {
    if (!navigationStore.currentBook) return
    await loadChapter(navigationStore.currentChapterIndex, true)
  }

  async function refreshChapter(): Promise<number> {
    if (!navigationStore.currentBook) return 0

    // 保存刷新前的滚动比例
    const scrollRatio = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight) || 0

    uiStore.setLoading(true)
    try {
      // 先刷新目录
      await navigationStore.refreshCatalog()
      // 强制刷新当前章节
      await loadChapter(navigationStore.currentChapterIndex, true)
      return scrollRatio
    } finally {
      uiStore.setLoading(false)
    }
  }

  // 章节索引管理
  function setCurrentChapterIndex(index: number) {
    if (navigationStore.setCurrentChapterIndex(index)) {
      // 保存进度
      navigationStore.saveProgress()
      
      // 在无限滚动模式下，确保当前章节在已加载章节列表中
      if (contentStore.loadedChapters.length > 0) {
        const hasChapter = contentStore.loadedChapters.some(ch => ch.index === index)
        if (!hasChapter && index < contentStore.loadedChapters.length) {
          logger.info(`Chapter ${index} not in loaded chapters, current loaded: ${contentStore.loadedChapters.map(ch => ch.index).join(', ')}`)
        }
      }
    }
  }

  // 根据滚动位置更新当前章节索引（用于无限滚动模式）
  function updateChapterIndexByScroll() {
    if (contentStore.loadedChapters.length === 0) return
    
    // 获取当前可见的章节标记
    const chapterMarkers = document.querySelectorAll('.chapter-marker[data-chapter-index]')
    if (chapterMarkers.length === 0) return
    
    const viewportTop = window.scrollY
    const viewportHeight = window.innerHeight
    const viewportCenter = viewportTop + viewportHeight / 2
    
    let currentVisibleIndex = navigationStore.currentChapterIndex
    
    // 找到最接近视口中心的章节
    for (let i = 0; i < chapterMarkers.length; i++) {
      const element = chapterMarkers[i] as HTMLElement
      const rect = element.getBoundingClientRect()
      const elementTop = rect.top + viewportTop
      
      if (elementTop <= viewportCenter) {
        const chapterIndex = parseInt(element.getAttribute('data-chapter-index') || '0')
        currentVisibleIndex = chapterIndex
      } else {
        break
      }
    }
    
    // 更新当前章节索引（如果有变化）
    if (currentVisibleIndex !== navigationStore.currentChapterIndex) {
      setCurrentChapterIndex(currentVisibleIndex)
    }
  }

  // 工具方法
  function isChapterCached(index: number): boolean {
    return contentStore.isChapterCached(index)
  }

  // 重置所有状态
  function reset() {
    navigationStore.reset()
    contentStore.clearCache()
    uiStore.reset()
  }

  return {
    // 状态 (computed properties that delegate to sub-stores)
    currentBook,
    catalog,
    currentChapterIndex,
    content,
    formattedContent,
    isLoading,
    isParsing,
    isLoadingMore,
    error,
    contentIssue,
    loadError,
    currentChapter,
    totalChapters,
    hasNextChapter,
    hasPrevChapter,
    progress,
    loadedChapters,
    readingMetrics,

    // 方法 (delegate to sub-stores)
    openBook,
    loadChapter,
    reloadCurrentChapter,
    nextChapter,
    prevChapter,
    goToChapter,
    goToChapterInScroll,
    refreshChapter,
    appendNextChapter,
    retryLoadNext,
    initInfiniteScroll,
    setCurrentChapterIndex,
    updateChapterIndexByScroll,
    isChapterCached,
    saveProgress: navigationStore.saveProgress,
    preloadChapters: contentStore.preloadChapters,
    reset,
    updateReadingMetrics: uiStore.updateReadingMetrics
  }
})
