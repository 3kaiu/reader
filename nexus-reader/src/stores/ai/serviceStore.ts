/**
 * AI服务Store - 集成新的AIServiceManager
 * 提供Vue组合式API接口，兼容现有代码
 */

import { computed } from 'vue'
import { aiServiceManager } from '@/services/ai/service'
import type { ModelInfo, AIRequestParams } from '@/types/ai'

/**
 * 使用AI服务的组合式API
 */
export function useAIService() {
  // 直接暴露service manager的响应式状态
  const isSupported = computed(() => aiServiceManager.isSupported.value)
  const isLoading = computed(() => aiServiceManager.isLoading.value)
  const isModelLoaded = computed(() => aiServiceManager.isModelLoaded.value)
  const loadProgress = computed(() => aiServiceManager.loadProgress.value)
  const loadStatus = computed(() => aiServiceManager.loadStatus.value)
  const error = computed(() => aiServiceManager.error.value)
  const currentModel = computed(() => aiServiceManager.currentModel.value)
  const performance = computed(() => aiServiceManager.performance.value)

  // 方法代理
  const initialize = () => aiServiceManager.initialize()
  const checkSupport = () => aiServiceManager.detectWebGPUSupport()
  const loadModel = (modelId?: string) => aiServiceManager.loadModel(modelId)
  const unloadModel = () => aiServiceManager.unloadModel()
  const inference = (prompt: string, params?: Partial<AIRequestParams>) =>
    aiServiceManager.inference(prompt, params)
  const isReady = () => aiServiceManager.isReady()
  const getRecommendedModels = () => aiServiceManager.getRecommendedModels()
  const getAllModels = () => aiServiceManager.getAllModels()
  const cleanup = () => aiServiceManager.cleanup()

  // 缓存管理方法
  const getCacheStats = () => aiServiceManager.getCacheStats()
  const clearModelCache = () => aiServiceManager.clearModelCache()
  const getCachedModels = () => aiServiceManager.getCachedModels()
  const preloadRecommendedModels = () => aiServiceManager.preloadRecommendedModels()

  return {
    // 状态
    isSupported,
    isLoading,
    isModelLoaded,
    loadProgress,
    loadStatus,
    error,
    currentModel,
    performance,

    // 方法
    initialize,
    checkSupport,
    loadModel,
    unloadModel,
    inference,
    isReady,
    getRecommendedModels,
    getAllModels,
    cleanup,

    // 缓存管理
    getCacheStats,
    clearModelCache,
    getCachedModels,
    preloadRecommendedModels,
  }
}

/**
 * 兼容性接口 - 保持与现有代码的兼容性
 */
export function useAIStore() {
  return useAIService()
}