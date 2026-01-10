/**
 * Reader Navigation Store - 导航和章节管理
 * 负责书籍信息、章节列表、当前位置等导航相关状态
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { bookApi, type Book, type Chapter } from '../../api'
import { logger } from '../../utils/logger'
import { useErrorHandler } from '../../composables/useErrorHandler'

const { formatErrorMessage } = useErrorHandler()

export const useReaderNavigationStore = defineStore('reader-navigation', () => {
  // 导航状态
  const currentBook = ref<Book | null>(null)
  const catalog = ref<Chapter[]>([])
  const currentChapterIndex = ref(0)
  
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
    
    try {
      const res = await bookApi.getChapterList(book.sourceId, book.bookUrl)
      if (res.isSuccess) {
        catalog.value = res.data
        // 换源时从第一章开始，否则恢复上次阅读位置
        currentChapterIndex.value = refresh ? 0 : (book.lastChapterIndex || 0)
        return true
      } else {
        throw new Error(res.errorMsg || '加载目录失败')
      }
    } catch (e) {
      throw new Error(formatErrorMessage(e))
    }
  }
  
  // 跳转到指定章节
  function goToChapter(index: number) {
    if (index >= 0 && index < catalog.value.length) {
      currentChapterIndex.value = index
      return true
    }
    return false
  }
  
  // 下一章
  function nextChapter() {
    if (hasNextChapter.value) {
      currentChapterIndex.value += 1
      return true
    }
    return false
  }
  
  // 上一章
  function prevChapter() {
    if (hasPrevChapter.value) {
      currentChapterIndex.value -= 1
      return true
    }
    return false
  }
  
  // 设置当前章节索引（不加载内容，用于滚动同步）
  function setCurrentChapterIndex(index: number) {
    if (index >= 0 && index < catalog.value.length && index !== currentChapterIndex.value) {
      currentChapterIndex.value = index
      return true
    }
    return false
  }
  
  // 刷新目录
  async function refreshCatalog() {
    if (!currentBook.value) return false
    
    try {
      const catalogRes = await bookApi.getChapterList(currentBook.value.sourceId, currentBook.value.bookUrl)
      if (catalogRes.isSuccess) {
        catalog.value = catalogRes.data
        return true
      } else {
        throw new Error(catalogRes.errorMsg || '刷新目录失败')
      }
    } catch (e) {
      throw new Error(formatErrorMessage(e))
    }
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
  
  // 重置
  function reset() {
    currentBook.value = null
    catalog.value = []
    currentChapterIndex.value = 0
  }
  
  return {
    // 状态
    currentBook,
    catalog,
    currentChapterIndex,
    
    // 计算属性
    currentChapter,
    totalChapters,
    hasNextChapter,
    hasPrevChapter,
    progress,
    
    // 方法
    openBook,
    goToChapter,
    nextChapter,
    prevChapter,
    setCurrentChapterIndex,
    refreshCatalog,
    saveProgress,
    reset
  }
})