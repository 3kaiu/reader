/**
 * 统一组合式函数
 *
 * 将所有Vue组合式函数聚合到一个文件中：
 * - 阅读相关组合函数
 * - AI功能组合函数
 * - UI交互组合函数
 * - 性能优化组合函数
 */

import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, config, errorHandler, performanceMonitor, storage } from '@/utils/unified-utils'
import { useUserStore, useReaderStore, useAiStore, useSettingsStore } from '@/stores/unified'

// ===== 阅读相关组合函数 =====

export function useReadingSession() {
  const readerStore = useReaderStore()
  const sessionStartTime = ref<number>(0)
  const readingTime = ref<number>(0)
  const timer = ref<NodeJS.Timeout | null>(null)

  const startSession = () => {
    sessionStartTime.value = Date.now()
    readingTime.value = 0

    timer.value = setInterval(() => {
      readingTime.value = Math.floor((Date.now() - sessionStartTime.value) / 1000)
    }, 1000)
  }

  const pauseSession = () => {
    if (timer.value) {
      clearInterval(timer.value)
      timer.value = null
    }
  }

  const resumeSession = () => {
    if (!timer.value) {
      timer.value = setInterval(() => {
        readingTime.value = Math.floor((Date.now() - sessionStartTime.value) / 1000)
      }, 1000)
    }
  }

  const endSession = async () => {
    pauseSession()

    if (readerStore.currentBook && readerStore.readingProgress) {
      try {
        // await api.post('/reading/sessions', {
        //   bookId: readerStore.currentBook.id,
        //   duration: readingTime.value,
        //   progress: readerStore.readingProgress,
        // })
        console.log('Reading session ended:', readingTime.value, 'seconds')
      } catch (error) {
        errorHandler.handle(error, { component: 'reading-session', operation: 'end-session' })
      }
    }
  }

  onUnmounted(() => {
    if (timer.value) {
      clearInterval(timer.value)
    }
  })

  return {
    readingTime: computed(() => readingTime.value),
    isActive: computed(() => timer.value !== null),
    startSession,
    pauseSession,
    resumeSession,
    endSession,
  }
}

export function useReadingProgress() {
  const readerStore = useReaderStore()
  const progress = ref<number>(0)
  const scrollTop = ref<number>(0)

  const updateProgress = (newProgress: number, newScrollTop: number) => {
    progress.value = Math.max(0, Math.min(100, newProgress))
    scrollTop.value = newScrollTop

    readerStore.updateProgress({
      bookId: readerStore.currentBook?.id || '',
      chapterId: readerStore.currentChapter?.id || '',
      position: progress.value,
      scrollTop: scrollTop.value,
      timestamp: Date.now(),
      completed: progress.value >= 100,
    })
  }

  const saveProgress = async () => {
    if (readerStore.readingProgress) {
      try {
        await api.post('/reading/progress', readerStore.readingProgress)
      } catch (error) {
        errorHandler.handle(error, { component: 'reading-progress', operation: 'save' })
      }
    }
  }

  // 自动保存进度
  watch([progress, scrollTop], () => {
    const timer = setTimeout(saveProgress, 2000) // 2秒后自动保存
    return () => clearTimeout(timer)
  }, { deep: true })

  return {
    progress: computed(() => progress.value),
    scrollTop: computed(() => scrollTop.value),
    updateProgress,
    saveProgress,
  }
}

export function useBookmarks() {
  const readerStore = useReaderStore()
  const bookmarks = computed(() => readerStore.bookmarks)

  const addBookmark = async (position: number, note?: string) => {
    if (readerStore.currentBook && readerStore.currentChapter) {
      await readerStore.addBookmark({
        chapterId: readerStore.currentChapter.id,
        position,
        note,
      })
    }
  }

  const removeBookmark = async (bookmarkId: string) => {
    try {
      // await api.delete(`/bookmarks/${bookmarkId}`)
      readerStore.bookmarks.splice(
        readerStore.bookmarks.findIndex(b => b.id === bookmarkId),
        1
      )
    } catch (error) {
      errorHandler.handle(error, { component: 'bookmarks', operation: 'remove' })
    }
  }

  const getBookmarksForChapter = (chapterId: string) => {
    return computed(() => bookmarks.value.filter(b => b.chapterId === chapterId))
  }

  return {
    bookmarks,
    addBookmark,
    removeBookmark,
    getBookmarksForChapter,
  }
}

// ===== AI功能组合函数 =====

export function useAiChat() {
  const aiStore = useAiStore()
  const isLoading = computed(() => aiStore.isProcessing)
  const messages = computed(() => aiStore.conversationHistory)

  const sendMessage = async (content: string, context?: string) => {
    await aiStore.sendMessage(content, context)
  }

  const clearHistory = () => {
    aiStore.clearHistory()
  }

  const switchModel = (model: string) => {
    aiStore.switchModel(model)
  }

  return {
    isLoading,
    messages,
    sendMessage,
    clearHistory,
    switchModel,
  }
}

export function useContentAnalysis() {
  const aiStore = useAiStore()
  const isAnalyzing = computed(() => aiStore.isProcessing)
  const results = computed(() => aiStore.analysisResults)

  const analyzeContent = async (content: string, type: 'summary' | 'insights' | 'tags' | 'sentiment') => {
    await aiStore.analyzeContent(content, type)
  }

  const getAnalysisResult = (type: string) => {
    return computed(() => results.value[type])
  }

  return {
    isAnalyzing,
    results,
    analyzeContent,
    getAnalysisResult,
  }
}

export function useAiRecommendations() {
  const recommendations = ref<any[]>([])
  const isLoading = ref(false)

  const getRecommendations = async (context: {
    currentBookId?: string
    userPreferences?: Record<string, any>
    readingHistory?: string[]
  }) => {
    isLoading.value = true
    try {
      // const response = await api.post('/ai/recommendations', context)
      // recommendations.value = response.data.recommendations
      console.log('Getting recommendations for:', context)
    } catch (error) {
      errorHandler.handle(error, { component: 'ai-recommendations', operation: 'get' })
    } finally {
      isLoading.value = false
    }
  }

  return {
    recommendations: computed(() => recommendations.value),
    isLoading: computed(() => isLoading.value),
    getRecommendations,
  }
}

// ===== UI交互组合函数 =====

export function useTheme() {
  const settingsStore = useSettingsStore()
  const theme = computed(() => settingsStore.theme)
  const isDark = computed(() => {
    if (theme.value === 'dark') return true
    if (theme.value === 'light') return false
    // auto mode
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  const setTheme = (newTheme: 'light' | 'dark' | 'auto') => {
    settingsStore.updateTheme(newTheme)
  }

  const toggleTheme = () => {
    const newTheme = isDark.value ? 'light' : 'dark'
    setTheme(newTheme)
  }

  // 监听系统主题变化
  onMounted(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      if (theme.value === 'auto') {
        // 重新计算isDark
      }
    }

    mediaQuery.addEventListener('change', handleChange)

    onUnmounted(() => {
      mediaQuery.removeEventListener('change', handleChange)
    })
  })

  return {
    theme,
    isDark,
    setTheme,
    toggleTheme,
  }
}

export function useResponsive() {
  const screenWidth = ref(0)
  const screenHeight = ref(0)
  const isMobile = computed(() => screenWidth.value < 768)
  const isTablet = computed(() => screenWidth.value >= 768 && screenWidth.value < 1024)
  const isDesktop = computed(() => screenWidth.value >= 1024)

  const updateScreenSize = () => {
    screenWidth.value = window.innerWidth
    screenHeight.value = window.innerHeight
  }

  onMounted(() => {
    updateScreenSize()
    window.addEventListener('resize', updateScreenSize)

    onUnmounted(() => {
      window.removeEventListener('resize', updateScreenSize)
    })
  })

  return {
    screenWidth: computed(() => screenWidth.value),
    screenHeight: computed(() => screenHeight.value),
    isMobile,
    isTablet,
    isDesktop,
  }
}

export function useLocalStorage<T>(key: string, defaultValue: T) {
  const storedValue = ref<T>(storage.get(key, defaultValue))

  const setValue = (value: T) => {
    storedValue.value = value
    storage.set(key, value)
  }

  const removeValue = () => {
    storedValue.value = defaultValue
    storage.remove(key)
  }

  // 监听其他标签页的变化
  const handleStorageChange = (event: StorageEvent) => {
    if (event.key === key && event.newValue !== null) {
      try {
        storedValue.value = JSON.parse(event.newValue)
      } catch {
        storedValue.value = defaultValue
      }
    }
  }

  onMounted(() => {
    window.addEventListener('storage', handleStorageChange)

    onUnmounted(() => {
      window.removeEventListener('storage', handleStorageChange)
    })
  })

  return {
    value: computed(() => storedValue.value),
    setValue,
    removeValue,
  }
}

// ===== 性能优化组合函数 =====

export function usePerformanceMonitor() {
  const metrics = ref<Record<string, number>>({})

  const measure = <T>(name: string, fn: () => T): T => {
    const start = performance.now()
    const result = fn()
    const duration = performance.now() - start

    metrics.value[name] = duration
    performanceMonitor.recordMetric(`vue_${name}`, duration)

    return result
  }

  const measureAsync = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
    const start = performance.now()
    const result = await fn()
    const duration = performance.now() - start

    metrics.value[name] = duration
    performanceMonitor.recordMetric(`vue_async_${name}`, duration)

    return result
  }

  const getMetrics = () => metrics.value

  return {
    measure,
    measureAsync,
    getMetrics,
  }
}

export function useLazyLoad() {
  const isVisible = ref(false)
  const elementRef = ref<HTMLElement | null>(null)
  const observer = ref<IntersectionObserver | null>(null)

  const setupObserver = () => {
    if (!elementRef.value) return

    observer.value = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            isVisible.value = true
            // 停止观察
            if (observer.value) {
              observer.value.disconnect()
            }
          }
        })
      },
      {
        rootMargin: '50px', // 提前50px开始加载
        threshold: 0.1,
      }
    )

    observer.value.observe(elementRef.value)
  }

  const cleanup = () => {
    if (observer.value) {
      observer.value.disconnect()
      observer.value = null
    }
  }

  onMounted(() => {
    nextTick(setupObserver)
  })

  onUnmounted(cleanup)

  return {
    isVisible: computed(() => isVisible.value),
    elementRef,
  }
}

export function useDebounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): T {
  let timeoutId: NodeJS.Timeout | null = null

  return ((...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }

    timeoutId = setTimeout(() => {
      fn(...args)
    }, delay)
  }) as T
}

export function useThrottle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): T {
  let inThrottle = false

  return ((...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }) as T
}

// ===== 路由和导航组合函数 =====

export function useNavigation() {
  const router = useRouter()
  const route = useRoute()

  const navigateToBook = (bookId: string) => {
    router.push(`/book/${bookId}`)
  }

  const navigateToChapter = (bookId: string, chapterId: string) => {
    router.push(`/book/${bookId}/chapter/${chapterId}`)
  }

  const navigateToSearch = (query: string) => {
    router.push(`/search?q=${encodeURIComponent(query)}`)
  }

  const navigateBack = () => {
    router.back()
  }

  const navigateToSettings = (section?: string) => {
    router.push(section ? `/settings/${section}` : '/settings')
  }

  return {
    currentRoute: computed(() => route),
    navigateToBook,
    navigateToChapter,
    navigateToSearch,
    navigateBack,
    navigateToSettings,
  }
}

// ===== 数据同步组合函数 =====

export function useOfflineSync() {
  const isOnline = ref(navigator.onLine)
  const pendingOperations = ref<Array<() => Promise<void>>>([])
  const isSyncing = ref(false)

  const addPendingOperation = (operation: () => Promise<void>) => {
    pendingOperations.value.push(operation)
  }

  const syncNow = async () => {
    if (!isOnline.value || isSyncing.value) return

    isSyncing.value = true
    const operations = [...pendingOperations.value]
    pendingOperations.value = []

    try {
      for (const operation of operations) {
        await operation()
      }
    } catch (error) {
      // 如果同步失败，将操作重新添加到队列
      pendingOperations.value.unshift(...operations)
      errorHandler.handle(error, { component: 'offline-sync', operation: 'sync' })
    } finally {
      isSyncing.value = false
    }
  }

  // 监听网络状态变化
  const handleOnline = () => {
    isOnline.value = true
    syncNow() // 重新上线时自动同步
  }

  const handleOffline = () => {
    isOnline.value = false
  }

  onMounted(() => {
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    onUnmounted(() => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    })
  })

  return {
    isOnline: computed(() => isOnline.value),
    isSyncing: computed(() => isSyncing.value),
    pendingOperations: computed(() => pendingOperations.value.length),
    addPendingOperation,
    syncNow,
  }
}

// ===== 默认导出 =====

export default {
  // 阅读相关
  useReadingSession,
  useReadingProgress,
  useBookmarks,

  // AI相关
  useAiChat,
  useContentAnalysis,
  useAiRecommendations,

  // UI相关
  useTheme,
  useResponsive,
  useLocalStorage,

  // 性能相关
  usePerformanceMonitor,
  useLazyLoad,
  useDebounce,
  useThrottle,

  // 导航相关
  useNavigation,

  // 同步相关
  useOfflineSync,
}