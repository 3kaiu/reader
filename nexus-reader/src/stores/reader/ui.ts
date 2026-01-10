/**
 * Reader UI Store - UI状态管理
 * 负责阅读器界面状态、加载状态和错误状态
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useReaderUIStore = defineStore('reader-ui', () => {
  // 加载状态
  const isLoading = ref(false)
  const isLoadingMore = ref(false)  // 加载更多章节状态
  const error = ref<string | null>(null)
  const loadError = ref<string | null>(null)  // 自动加载错误状态
  
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
  
  // 设置加载状态
  function setLoading(loading: boolean) {
    isLoading.value = loading
  }
  
  function setLoadingMore(loading: boolean) {
    isLoadingMore.value = loading
  }
  
  // 设置错误状态
  function setError(errorMsg: string | null) {
    error.value = errorMsg
  }
  
  function setLoadError(errorMsg: string | null) {
    loadError.value = errorMsg
  }
  
  // 清除所有错误
  function clearErrors() {
    error.value = null
    loadError.value = null
  }
  
  // 重置所有状态
  function reset() {
    isLoading.value = false
    isLoadingMore.value = false
    error.value = null
    loadError.value = null
    readingMetrics.value = {
      charsRead: 0,
      timeSpent: 0,
      speed: 0,
      lastUpdateTime: 0
    }
  }
  
  return {
    // 状态
    isLoading,
    isLoadingMore,
    error,
    loadError,
    readingMetrics,
    
    // 方法
    updateReadingMetrics,
    setLoading,
    setLoadingMore,
    setError,
    setLoadError,
    clearErrors,
    reset
  }
})