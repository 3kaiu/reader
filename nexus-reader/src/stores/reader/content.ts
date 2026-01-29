/**
 * Reader Content Store - 内容管理
 * 负责章节内容的加载、缓存和格式化
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { bookApi, type Book, type Chapter } from '../../api'
import { logger } from '../../utils/logger'
import { ERROR_PATTERNS, MIN_CONTENT_LENGTH } from '../../constants/reader'
import { useOfflineStore } from '../offlineStorage'
import { formatContentAsync } from '../../composables/useContentParser'
import { perfMonitor } from '../../services/performance/monitor'

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

export const useReaderContentStore = defineStore('reader-content', () => {
  // 内容状态
  const content = ref('')
  const formattedContent = ref('') // 预先格式化好的 HTML
  const isParsing = ref(false) // 正在解析内容
  const contentIssue = ref<string | null>(null)  // 内容问题提示

  // 无限滚动模式: 存储已加载的章节内容
  const loadedChapters = ref<{ index: number; title: string; content: string; formattedContent?: string }[]>([])

  // 章节内存管理配置
  const MAX_LOADED_CHAPTERS = 20 // 最多保留20章
  const CHAPTER_CLEANUP_THRESHOLD = 15 // 超过15章时开始清理

  // O(1) access to max loaded index (chapters are appended in order)
  const maxLoadedChapterIndex = computed(() => {
    const chapters = loadedChapters.value
    if (chapters.length === 0) return -1
    return chapters[chapters.length - 1].index
  })

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

  // 加载章节内容
  async function loadChapterContent(
    book: Book,
    catalog: Chapter[],
    index: number,
    forceRefresh = false
  ) {
    if (!book || index < 0 || index >= catalog.length) return

    // 如果强制刷新，先清除缓存
    if (forceRefresh) {
      const offlineStore = useOfflineStore()
      chapterCache.delete(index)
      await offlineStore.clearCachedChapter(book.bookUrl, index)
    }

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
      preloadChapters(book, catalog, index + 1)
      return cachedContent
    }

    // 2. 检查离线缓存 (IndexedDB)
    const offlineStore = useOfflineStore()
    const offlineCached = await offlineStore.getCachedChapter(book.bookUrl, index)
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

      preloadChapters(book, catalog, index + 1)
      return offlineCached.content
    }

    // 3. 从网络加载
    try {
      const networkMark = `chapter-network-${index}`
      perfMonitor.startMark(networkMark)
      const res = await bookApi.getBookContent(book.sourceId, catalog[index].url)
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

        perfMonitor.endMark(loadMark, 'reader-chapter-load', {
          index,
          source: 'network',
          length: chapterContent.length
        })

        // 触发预加载
        preloadChapters(book, catalog, index + 1)

        // 自动缓存到离线存储
        offlineStore.cacheChapter({
          id: `${book.bookUrl}:${index}`,
          bookUrl: book.bookUrl,
          sourceId: book.sourceId,
          chapterIndex: index,
          title: catalog[index]?.title || '',
          content: chapterContent,
          cachedAt: Date.now(),
        }).catch(() => {
          // 忽略缓存错误
        })

        return chapterContent
      } else {
        throw new Error(res.errorMsg || '加载内容失败')
      }
    } catch (e) {
      throw e
    }
  }

  // 追加下一章内容（无限滚动模式）
  async function appendChapterContent(
    book: Book,
    catalog: Chapter[],
    nextIndex: number
  ): Promise<string> {
    let chapterContent: string

    if (chapterCache.has(nextIndex)) {
      chapterContent = chapterCache.get(nextIndex)!
    } else {
      const res = await bookApi.getBookContent(book.sourceId, catalog[nextIndex].url)
      if (!res.isSuccess) {
        throw new Error(res.errorMsg || '加载章节失败')
      }
      chapterContent = res.data.content
      chapterCache.set(nextIndex, chapterContent)
    }

    // 追加到已加载章节
    const formatted = await formatContentAsync(chapterContent)
    loadedChapters.value.push({
      index: nextIndex,
      title: catalog[nextIndex]?.title || `第${nextIndex + 1}章`,
      content: chapterContent,
      formattedContent: formatted
    })

    // 内存管理：清理过多的已加载章节
    if (loadedChapters.value.length > MAX_LOADED_CHAPTERS) {
      const toRemove = loadedChapters.value.length - CHAPTER_CLEANUP_THRESHOLD
      const removedChapters = loadedChapters.value.splice(0, toRemove)

      // 同时清理对应的章节缓存
      removedChapters.forEach(chapter => {
        chapterCache.delete(chapter.index)
      })

      logger.info(`清理了${toRemove}个章节以释放内存`, {
        function: 'appendChapterContent',
        remainingChapters: loadedChapters.value.length
      })
    }

    // 触发预加载
    preloadChapters(book, catalog, nextIndex + 1)

    return chapterContent
  }

  // 初始化无限滚动模式
  function initInfiniteScroll(currentChapter: { title: string }) {
    loadedChapters.value = [{
      index: 0, // 这个会被外部正确设置
      title: currentChapter?.title || '',
      content: content.value,
      formattedContent: formattedContent.value
    }]
  }

  // 预加载章节
  async function preloadChapters(book: Book, catalog: Chapter[], startIndex: number) {
    if (!book || startIndex < 0 || startIndex >= catalog.length) return

    const count = getPreloadCount()
    const endIndex = Math.min(startIndex + count, catalog.length)
    const offlineStore = useOfflineStore()

    for (let i = startIndex; i < endIndex; i++) {
      // 如果已经内存缓存了，跳过
      if (chapterCache.has(i)) continue

      // 检查离线缓存
      const offlineCached = await offlineStore.getCachedChapter(book.bookUrl, i)
      if (offlineCached) {
        chapterCache.set(i, offlineCached.content)
        continue
      }

      // 异步加载但不阻塞主流程
      const chapter = catalog[i]
      if (!chapter) continue

      bookApi.getBookContent(book.sourceId, chapter.url)
        .then(res => {
          if (res.isSuccess) {
            const chapterContent = res.data.content
            chapterCache.set(i, chapterContent)
            // 同时存入离线缓存
            offlineStore.cacheChapter({
              id: `${book.bookUrl}:${i}`,
              bookUrl: book.bookUrl,
              sourceId: book.sourceId,
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

  // 检查章节是否已缓存
  function isChapterCached(index: number): boolean {
    return chapterCache.has(index)
  }

  // 清理缓存
  function clearCache() {
    chapterCache.clear()
    loadedChapters.value = []
    content.value = ''
    formattedContent.value = ''
    contentIssue.value = null
  }

  return {
    // 状态
    content,
    formattedContent,
    isParsing,
    contentIssue,
    loadedChapters,
    maxLoadedChapterIndex,

    // 方法
    loadChapterContent,
    appendChapterContent,
    initInfiniteScroll,
    preloadChapters,
    isChapterCached,
    clearCache
  }
})