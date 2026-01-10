import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { bookApi, type Book, type Chapter } from '../api'
import { logger } from '../utils/logger'
import { ERROR_PATTERNS, ERROR_MESSAGE_MAP, PRELOAD_CONFIG, MIN_CONTENT_LENGTH } from '../constants/reader'
import { useOfflineStore } from './offlineStorage'
import { formatContentAsync } from '../composables/useContentParser'
import { perfMonitor } from '../utils/performance'
import { useErrorHandler } from '../composables/useErrorHandler'
// import { syncChannel } from '../utils/broadcast'

const { formatErrorMessage } = useErrorHandler()

// 检测内容是否有问题
function detectContentIssue(text: string): string | null {
  if (!text) return '章节内容为空'
  if (text.length < MIN_CONTENT_LENGTH) {
    // 检查是否只是短章节说明
    if (!text.includes('第') && !text.includes('章')) {
      return '章节内容过短，可能加载失败'
    }
  }
  for (const pattern of ERROR_PATTERNS) {
    if (text.includes(pattern)) {
      return '书源返回受限内容，建议换一个书源'
    }
  }
  return null
}

export const useReaderStore = defineStore('reader', () => {
  // 状态
  const currentBook = ref<Book | null>(null)
  const catalog = ref<Chapter[]>([])
  const currentChapterIndex = ref(0)
  const content = ref('')
  const formattedContent = ref('') // 预先格式化好的 HTML
  const isLoading = ref(false)
  const isParsing = ref(false) // 正在解析内容
  const isLoadingMore = ref(false)  // 加载更多章节状态
  const error = ref<string | null>(null)
  const contentIssue = ref<string | null>(null)  // 内容问题提示
  const loadError = ref<string | null>(null)  // 自动加载错误状态

  // 无限滚动模式: 存储已加载的章节内容
  const loadedChapters = ref<{ index: number; title: string; content: string; formattedContent?: string }[]>([])

  // 阅读指标
  const readingMetrics = ref({
    charsRead: 0,
    timeSpent: 0,
    speed: 0,
    lastUpdateTime: 0
  })

  // 更新阅读指标
  function updateReadingMetrics(length: number) {
    if (length > 0) {
      readingMetrics.value.charsRead += length
      readingMetrics.value.lastUpdateTime = Date.now()
    }
  }

  // 缓存
  const chapterCache = new Map<number, string>()

  // 根据网络状况动态调整预加载数量
  function getPreloadCount(): number {
    const connection = (navigator as any).connection
    if (!connection) return 5 // 默认值

    switch (connection.effectiveType) {
      case '4g': return 8      // 快速网络多预加载
      case '3g': return 3      // 中等网络适当预加载
      case '2g':
      case 'slow-2g': return 1 // 慢速网络最少预加载
      default: return 5
    }
  }

  // 计算属性
  const currentChapter = computed(() => catalog.value[currentChapterIndex.value])
  const totalChapters = computed(() => catalog.value.length)
  const hasNextChapter = computed(() => currentChapterIndex.value < totalChapters.value - 1)
  const hasPrevChapter = computed(() => currentChapterIndex.value > 0)
  const progress = computed(() =>
    totalChapters.value > 0
      ? Math.round((currentChapterIndex.value + 1) / totalChapters.value * 100)
      : 0
  )

  // 打开书籍 (refresh=true 强制刷新目录，换源时使用)
  async function openBook(book: Book, refresh = false) {
    currentBook.value = book
    isLoading.value = true
    error.value = null
    contentIssue.value = null
    chapterCache.clear() // 清空章节内容缓存
    loadedChapters.value = [] // 清空已加载章节

    try {
      const res = await bookApi.getChapterList(book.sourceId, book.bookUrl)
      if (res.isSuccess) {
        catalog.value = res.data
        // 换源时从第一章开始，否则恢复上次阅读位置
        currentChapterIndex.value = refresh ? 0 : (book.lastChapterIndex || 0)
        await loadChapter(currentChapterIndex.value)
      } else {
        error.value = formatErrorMessage(res.errorMsg || '加载目录失败')
      }
    } catch (e) {
      error.value = formatErrorMessage(e)
    } finally {
      isLoading.value = false
    }
  }

  // 加载章节内容
  async function loadChapter(index: number, forceRefresh = false) {
    if (!currentBook.value || index < 0 || index >= catalog.value.length) return

    // 如果强制刷新，先清除缓存
    if (forceRefresh) {
      const offlineStore = useOfflineStore()
      chapterCache.delete(index)
      await offlineStore.clearCachedChapter(currentBook.value.bookUrl, index)
    }

    // 先设置索引，让UI响应
    currentChapterIndex.value = index
    error.value = null
    contentIssue.value = null  // 重置内容问题状态

    const loadMark = `chapter-load-${index}`
    perfMonitor.startMark(loadMark)

    // 1. 检查内存缓存
    if (chapterCache.has(index)) {
      const cachedContent = chapterCache.get(index)!
      content.value = cachedContent
      isParsing.value = true
      formattedContent.value = await formatContentAsync(cachedContent)
      isParsing.value = false
      contentIssue.value = detectContentIssue(cachedContent)

      perfMonitor.endMark(loadMark, 'reader-chapter-load', {
        index,
        source: 'memory-cache'
      })

      // 触发预加载
      preloadChapters(index + 1)
      return
    }

    // 2. 检查离线缓存 (IndexedDB)
    const offlineStore = useOfflineStore()
    const offlineCached = await offlineStore.getCachedChapter(
      currentBook.value.bookUrl,
      index
    )
    if (offlineCached) {
      content.value = offlineCached.content
      chapterCache.set(index, offlineCached.content)
      isParsing.value = true
      formattedContent.value = await formatContentAsync(offlineCached.content)
      isParsing.value = false
      contentIssue.value = detectContentIssue(offlineCached.content)

      perfMonitor.endMark(loadMark, 'reader-chapter-load', {
        index,
        source: 'indexeddb'
      })

      preloadChapters(index + 1)
      return
    }

    // 3. 从网络加载
    isLoading.value = true

    try {
      const networkMark = `chapter-network-${index}`
      perfMonitor.startMark(networkMark)
      const res = await bookApi.getBookContent(currentBook.value.sourceId, catalog.value[index].url)
      perfMonitor.endMark(networkMark, 'reader-network-fetch', { index })

      if (res.isSuccess) {
        const chapterContent = res.data.content
        content.value = chapterContent
        chapterCache.set(index, chapterContent)

        isParsing.value = true
        formattedContent.value = await formatContentAsync(chapterContent)
        isParsing.value = false

        // 检测内容问题
        contentIssue.value = detectContentIssue(chapterContent)
        // 保存阅读进度
        saveProgress()
        // 更新阅读速度指标
        updateReadingMetrics(chapterContent.length)

        perfMonitor.endMark(loadMark, 'reader-chapter-load', {
          index,
          source: 'network',
          length: chapterContent.length
        })

        // 5. 索引到 AI RAG 知识库 (使用 Scheduler API 优化性能)
        const runIndexing = async () => {
          try {
            const { useAIStore } = await import('./ai')
            const aiStore = useAIStore()
            await aiStore.indexChapter(catalog.value[index].title || '', chapterContent, index)
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

        // 触发预加载
        preloadChapters(index + 1)

        // 4. 自动缓存到离线存储
        offlineStore.cacheChapter({
          id: `${currentBook.value.bookUrl}:${index}`,
          bookUrl: currentBook.value.bookUrl,
          sourceId: currentBook.value.sourceId,
          chapterIndex: index,
          title: catalog.value[index]?.title || '',
          content: chapterContent,
          cachedAt: Date.now(),
        }).catch(() => {
          // 忽略缓存错误
        })
      } else {
        error.value = formatErrorMessage(res.errorMsg || '加载内容失败')
      }
    } catch (e) {
      error.value = formatErrorMessage(e)
    } finally {
      isLoading.value = false
    }
  }

  // 下一章
  function nextChapter() {
    if (hasNextChapter.value) {
      loadChapter(currentChapterIndex.value + 1)
    }
  }

  // 重新加载当前章节
  async function reloadCurrentChapter() {
    if (!currentBook.value) return
    await loadChapter(currentChapterIndex.value, true)
  }

  // 追加下一章 (无限滚动模式) - 增强版本，支持重试
  async function appendNextChapter(): Promise<boolean> {
    if (!currentBook.value || isLoadingMore.value) return false

    // 找到已加载章节中最大的索引
    const maxLoadedIndex = loadedChapters.value.length > 0
      ? Math.max(...loadedChapters.value.map(c => c.index))
      : currentChapterIndex.value

    const nextIndex = maxLoadedIndex + 1
    if (nextIndex >= catalog.value.length) return false

    isLoadingMore.value = true

    // 重试逻辑
    const maxRetries = 3
    let lastError: any = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // 检查缓存
        let chapterContent: string
        if (chapterCache.has(nextIndex)) {
          chapterContent = chapterCache.get(nextIndex)!
        } else {
          const res = await bookApi.getBookContent(currentBook.value.sourceId, catalog.value[nextIndex].url)
          if (!res.isSuccess) {
            lastError = new Error(res.errorMsg || '加载章节失败')
            if (attempt < maxRetries) {
              // 等待后重试，使用指数退避
              await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000))
              continue
            }
            return false
          }
          chapterContent = res.data.content
          chapterCache.set(nextIndex, chapterContent)
        }

        // 追加到已加载章节
        const formatted = await formatContentAsync(chapterContent)
        loadedChapters.value.push({
          index: nextIndex,
          title: catalog.value[nextIndex]?.title || `第${nextIndex + 1}章`,
          content: chapterContent,
          formattedContent: formatted
        })

        // 清除错误状态
        loadError.value = null

        // 触发预加载
        preloadChapters(nextIndex + 1)

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
        loadError.value = lastError?.message || '网络连接异常，请检查网络后重试'
        
        return false
      } finally {
        isLoadingMore.value = false
      }
    }

    // 所有重试都失败了
    logger.error(`加载下一章失败，已重试${maxRetries}次`, lastError as Error, { 
      function: 'appendNextChapter',
      nextIndex,
      attempts: maxRetries
    })
    return false
  }

  // 重试加载下一章
  async function retryLoadNext(): Promise<boolean> {
    loadError.value = null // 清除错误状态
    return await appendNextChapter()
  }
  // 初始化无限滚动模式
  function initInfiniteScroll() {
    loadError.value = null // 清除错误状态
    loadedChapters.value = [{
      index: currentChapterIndex.value,
      title: currentChapter.value?.title || '',
      content: content.value,
      formattedContent: formattedContent.value
    }]
  }

  // 上一章
  function prevChapter() {
    if (hasPrevChapter.value) {
      loadChapter(currentChapterIndex.value - 1)
    }
  }

  // 跳转到指定章节
  async function goToChapter(index: number) {
    if (index >= 0 && index < catalog.value.length) {
      await loadChapter(index)
    }
  }

  // 跳转到指定章节（无限滚动模式优化版本）
  async function goToChapterInScroll(index: number) {
    if (index < 0 || index >= catalog.value.length) return
    
    // 检查目标章节是否已经在已加载章节中
    const targetChapter = loadedChapters.value.find(ch => ch.index === index)
    
    if (targetChapter) {
      // 章节已加载，直接更新索引并滚动
      setCurrentChapterIndex(index)
    } else {
      // 章节未加载，需要重新加载
      await loadChapter(index)
      initInfiniteScroll()
    }
  }

  // 刷新当前章节 (返回刷新前的滚动比例供调用方恢复)
  async function refreshChapter(): Promise<number> {
    if (!currentBook.value) return 0

    // 保存刷新前的滚动比例
    const scrollRatio = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight) || 0

    isLoading.value = true
    try {
      // 先刷新目录
      const catalogRes = await bookApi.getChapterList(currentBook.value.sourceId, currentBook.value.bookUrl)
      if (catalogRes.isSuccess) {
        catalog.value = catalogRes.data
      }
      // 清除当前缓存并强制刷新
      chapterCache.delete(currentChapterIndex.value)
      await loadChapter(currentChapterIndex.value)

      return scrollRatio
    } finally {
      isLoading.value = false
    }
  }

  // 检查章节是否已缓存
  function isChapterCached(index: number): boolean {
    return chapterCache.has(index)
  }

  // 保存阅读进度到服务器 (自动获取当前滚动百分比)
  async function saveProgress() {
    if (!currentBook.value || !currentBook.value.id) return

    // 计算当前滚动百分比 (0-100)
    const scrollHeight = document.documentElement.scrollHeight - window.innerHeight
    const scrollPercent = scrollHeight > 0
      ? Math.round((window.scrollY / scrollHeight) * 100)
      : 0

    try {
      await bookApi.saveBookProgress(currentBook.value.id, currentChapterIndex.value, scrollPercent)
    } catch (e) {
      logger.error('保存进度失败', e as Error, { function: 'saveProgress' })
    }
  }

  // 设置当前章节索引（不加载内容，用于滚动同步）
  function setCurrentChapterIndex(index: number) {
    if (index >= 0 && index < catalog.value.length && index !== currentChapterIndex.value) {
      currentChapterIndex.value = index
      // 保存进度
      saveProgress()
      
      // 在无限滚动模式下，确保当前章节在已加载章节列表中
      if (loadedChapters.value.length > 0) {
        const hasChapter = loadedChapters.value.some(ch => ch.index === index)
        if (!hasChapter && index < loadedChapters.value.length) {
          // 如果当前章节不在已加载列表中，但索引在范围内，可能需要重新初始化
          logger.info(`Chapter ${index} not in loaded chapters, current loaded: ${loadedChapters.value.map(ch => ch.index).join(', ')}`)
        }
      }
    }
  }

  // 根据滚动位置更新当前章节索引（用于无限滚动模式）
  function updateChapterIndexByScroll() {
    if (loadedChapters.value.length === 0) return
    
    // 获取当前可见的章节标记
    const chapterMarkers = document.querySelectorAll('.chapter-marker[data-chapter-index]')
    if (chapterMarkers.length === 0) return
    
    const viewportTop = window.scrollY
    const viewportHeight = window.innerHeight
    const viewportCenter = viewportTop + viewportHeight / 2
    
    let currentVisibleIndex = currentChapterIndex.value
    
    // 找到最接近视口中心的章节
    for (const marker of chapterMarkers) {
      const element = marker as HTMLElement
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
    if (currentVisibleIndex !== currentChapterIndex.value) {
      setCurrentChapterIndex(currentVisibleIndex)
    }
  }

  // 重置
  function reset() {
    currentBook.value = null
    catalog.value = []
    currentChapterIndex.value = 0
    content.value = ''
    error.value = null
    contentIssue.value = null
    loadError.value = null
    loadedChapters.value = []
    chapterCache.clear()
    readingMetrics.value.lastUpdateTime = 0
  }

  // 预加载章节
  async function preloadChapters(startIndex: number) {
    if (!currentBook.value || startIndex < 0 || startIndex >= catalog.value.length) return

    const count = getPreloadCount()
    const endIndex = Math.min(startIndex + count, catalog.value.length)
    const offlineStore = useOfflineStore()

    for (let i = startIndex; i < endIndex; i++) {
      // 如果已经内存缓存了，跳过
      if (chapterCache.has(i)) continue

      // 检查离线缓存
      const offlineCached = await offlineStore.getCachedChapter(
        currentBook.value.bookUrl,
        i
      )
      if (offlineCached) {
        chapterCache.set(i, offlineCached.content)
        continue
      }

      // 异步加载但不阻塞主流程
      const sourceId = currentBook.value.sourceId
      const bookUrl = currentBook.value.bookUrl
      const chapter = catalog.value[i]

      if (!chapter) continue

      bookApi.getBookContent(sourceId, chapter.url)
        .then(res => {
          if (res.isSuccess) {
            const chapterContent = res.data.content
            chapterCache.set(i, chapterContent)
            // 同时存入离线缓存
            offlineStore.cacheChapter({
              id: `${bookUrl}:${i}`,
              bookUrl: bookUrl,
              sourceId: sourceId,
              chapterIndex: i,
              title: chapter.title || '',
              content: chapterContent,
              cachedAt: Date.now(),
            }).catch(() => { })
          }
        })
        .catch(() => { })
    }
  }

  return {
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
    saveProgress,
    preloadChapters,
    reset,
    readingMetrics,
    updateReadingMetrics
  }
})
