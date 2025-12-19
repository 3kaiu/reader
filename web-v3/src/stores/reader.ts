import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { bookApi, type Book, type Chapter } from '../api'

export const useReaderStore = defineStore('reader', () => {
  // 状态
  const currentBook = ref<Book | null>(null)
  const catalog = ref<Chapter[]>([])
  const currentChapterIndex = ref(0)
  const content = ref('')
  const isLoading = ref(false)
  const isLoadingMore = ref(false)  // 加载更多章节状态
  const error = ref<string | null>(null)

  // 无限滚动模式: 存储已加载的章节内容
  const loadedChapters = ref<{ index: number; title: string; content: string }[]>([])

  // 缓存
  const chapterCache = new Map<number, string>()
  const PRELOAD_COUNT = 5

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

  // 打开书籍
  async function openBook(book: Book) {
    currentBook.value = book
    isLoading.value = true
    error.value = null
    chapterCache.clear() // 清空缓存

    try {
      const res = await bookApi.getChapterList(book.bookUrl)
      if (res.isSuccess) {
        catalog.value = res.data
        // 恢复上次阅读位置
        currentChapterIndex.value = book.durChapterIndex || 0
        await loadChapter(currentChapterIndex.value)
      } else {
        error.value = res.errorMsg || '加载目录失败'
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

    // 检查缓存
    if (chapterCache.has(index)) {
      content.value = chapterCache.get(index)!
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
        // 触发预加载
        preloadChapters(index + 1)
      } else {
        error.value = res.errorMsg || '加载内容失败'
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

    for (let i = 0; i < PRELOAD_COUNT; i++) {
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
