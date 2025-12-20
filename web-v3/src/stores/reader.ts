import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { bookApi, type Book, type Chapter } from '../api'

// 检测问题内容的关键词模式
const ERROR_PATTERNS = [
  '访问次数已达上限',
  '免登录访问次数',
  '请登录后',
  '正在加载中',
  '内容加载失败',
  '请刷新重试',
  '防盗章节',
  '本章节是锁章',
  '购买VIP',
  '充值阅读',
  '订阅后查看',
  '本章未购买',
  '请先订阅',
  '付费章节',
  '正版订阅',
]

// 检测内容是否有问题
function detectContentIssue(text: string): string | null {
  if (!text) return '章节内容为空'
  if (text.length < 200) {
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

// 格式化错误信息，将技术性错误转换为用户友好提示
const ERROR_MESSAGE_MAP: Record<string, string> = {
  'TocEmptyException': '目录加载失败，该书源可能已失效，请换源',
  '目录为空': '目录加载失败，请尝试换一个书源',
  'SourceException': '书源解析失败，请换一个书源',
  'ContentEmptyException': '章节内容为空，请换源重试',
  'NetworkException': '网络连接失败，请检查网络后重试',
  'TimeoutException': '请求超时，请稍后重试',
  'ConcurrentException': '请求过于频繁，请稍后重试',
  'NullPointerException': '数据解析失败，请换一个书源',
  'SSLException': '安全连接失败，请换一个书源',
  'UnknownHostException': '无法连接书源服务器，请换源',
}

function formatErrorMessage(rawError: string): string {
  if (!rawError) return '未知错误'

  // 检查已知错误类型
  for (const [key, message] of Object.entries(ERROR_MESSAGE_MAP)) {
    if (rawError.includes(key)) {
      return message
    }
  }

  // 移除 Java 异常前缀，只保留冒号后的信息
  if (rawError.includes('Exception:')) {
    const parts = rawError.split(':')
    if (parts.length > 1) {
      return parts.slice(1).join(':').trim() || '加载失败，请换源重试'
    }
  }

  // 如果是很长的技术性错误，简化显示
  if (rawError.length > 50 && (rawError.includes('.') && rawError.includes('Exception'))) {
    return '加载失败，请尝试换一个书源'
  }

  return rawError
}

export const useReaderStore = defineStore('reader', () => {
  // 状态
  const currentBook = ref<Book | null>(null)
  const catalog = ref<Chapter[]>([])
  const currentChapterIndex = ref(0)
  const content = ref('')
  const isLoading = ref(false)
  const isLoadingMore = ref(false)  // 加载更多章节状态
  const error = ref<string | null>(null)
  const contentIssue = ref<string | null>(null)  // 内容问题提示

  // 无限滚动模式: 存储已加载的章节内容
  const loadedChapters = ref<{ index: number; title: string; content: string }[]>([])

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
      const res = await bookApi.getChapterList(book.bookUrl, refresh)
      if (res.isSuccess) {
        catalog.value = res.data
        // 换源时从第一章开始，否则恢复上次阅读位置
        currentChapterIndex.value = refresh ? 0 : (book.durChapterIndex || 0)
        await loadChapter(currentChapterIndex.value)
      } else {
        error.value = formatErrorMessage(res.errorMsg || '加载目录失败')
      }
    } catch (e) {
      error.value = '无法加载书籍目录'
      console.error(e)
    } finally {
      isLoading.value = false
    }
  }

  // 加载章节内容
  async function loadChapter(index: number) {
    if (!currentBook.value || index < 0 || index >= catalog.value.length) return

    // 先设置索引，让UI响应
    currentChapterIndex.value = index
    error.value = null
    contentIssue.value = null  // 重置内容问题状态

    // 检查缓存
    if (chapterCache.has(index)) {
      const cachedContent = chapterCache.get(index)!
      content.value = cachedContent
      contentIssue.value = detectContentIssue(cachedContent)
      // 触发预加载
      preloadChapters(index + 1)
      return
    }

    isLoading.value = true

    try {
      const res = await bookApi.getBookContent(currentBook.value.bookUrl, index)
      if (res.isSuccess) {
        content.value = res.data
        chapterCache.set(index, res.data)
        // 检测内容问题
        contentIssue.value = detectContentIssue(res.data)
        // 触发预加载
        preloadChapters(index + 1)
      } else {
        error.value = formatErrorMessage(res.errorMsg || '加载内容失败')
      }
    } catch (e) {
      error.value = '无法加载章节内容'
      console.error(e)
    } finally {
      isLoading.value = false
    }
  }

  // 预加载章节
  async function preloadChapters(startIndex: number) {
    if (!currentBook.value) return

    const preloadCount = getPreloadCount()
    for (let i = 0; i < preloadCount; i++) {
      const targetIndex = startIndex + i
      if (targetIndex >= catalog.value.length) break

      if (!chapterCache.has(targetIndex)) {
        try {
          // 静默加载，不影响 isLoading
          bookApi.getBookContent(currentBook.value.bookUrl, targetIndex).then(res => {
            if (res.isSuccess) {
              chapterCache.set(targetIndex, res.data)
            }
          })
        } catch (e) {
          // 忽略预加载错误
        }
      }
    }
  }

  // 下一章
  function nextChapter() {
    if (hasNextChapter.value) {
      loadChapter(currentChapterIndex.value + 1)
    }
  }

  // 追加下一章 (无限滚动模式)
  async function appendNextChapter(): Promise<boolean> {
    if (!currentBook.value || isLoadingMore.value) return false

    // 找到已加载章节中最大的索引
    const maxLoadedIndex = loadedChapters.value.length > 0
      ? Math.max(...loadedChapters.value.map(c => c.index))
      : currentChapterIndex.value

    const nextIndex = maxLoadedIndex + 1
    if (nextIndex >= catalog.value.length) return false

    isLoadingMore.value = true

    try {
      // 检查缓存
      let chapterContent: string
      if (chapterCache.has(nextIndex)) {
        chapterContent = chapterCache.get(nextIndex)!
      } else {
        const res = await bookApi.getBookContent(currentBook.value.bookUrl, nextIndex)
        if (!res.isSuccess) return false
        chapterContent = res.data
        chapterCache.set(nextIndex, chapterContent)
      }

      // 追加到已加载章节
      loadedChapters.value.push({
        index: nextIndex,
        title: catalog.value[nextIndex]?.title || `第${nextIndex + 1}章`,
        content: chapterContent
      })

      // 触发预加载
      preloadChapters(nextIndex + 1)

      return true
    } catch (e) {
      console.error('加载下一章失败:', e)
      return false
    } finally {
      isLoadingMore.value = false
    }
  }

  // 初始化无限滚动模式
  function initInfiniteScroll() {
    loadedChapters.value = [{
      index: currentChapterIndex.value,
      title: currentChapter.value?.title || '',
      content: content.value
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

  // 刷新当前章节
  async function refreshChapter() {
    if (!currentBook.value) return

    isLoading.value = true
    try {
      // 先刷新目录
      const catalogRes = await bookApi.getChapterList(currentBook.value.bookUrl, true)
      if (catalogRes.isSuccess) {
        catalog.value = catalogRes.data
      }
      // 清除当前缓存并强制刷新
      chapterCache.delete(currentChapterIndex.value)
      await loadChapter(currentChapterIndex.value)
    } finally {
      isLoading.value = false
    }
  }

  // 重置
  function reset() {
    currentBook.value = null
    catalog.value = []
    currentChapterIndex.value = 0
    content.value = ''
    error.value = null
    loadedChapters.value = []
    chapterCache.clear()
  }

  return {
    currentBook,
    catalog,
    currentChapterIndex,
    content,
    isLoading,
    isLoadingMore,
    error,
    contentIssue,
    currentChapter,
    totalChapters,
    hasNextChapter,
    hasPrevChapter,
    progress,
    loadedChapters,
    openBook,
    loadChapter,
    nextChapter,
    prevChapter,
    goToChapter,
    refreshChapter,
    appendNextChapter,
    initInfiniteScroll,
    reset,
  }
})
