/**
 * AI Store
 *
 * Thin Pinia wrapper over the local AI runtime manager.
 */

import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getAIServiceManager } from '@/services/ai/service'
import type { ModelInfo } from '@/types/ai'
import {
  clearCachesByPatterns,
  estimateBrowserStorage,
  type BrowserStorageEstimate,
} from '@/utils/browserStorage'
import { logger } from '@/utils/logger'

type RuntimeCacheStats = {
  totalSize: number
  modelCount: number
}

type RuntimeLoadingStep = {
  key: string
  label: string
  complete: boolean
}

function normalizeCacheStats(stats: RuntimeCacheStats): RuntimeCacheStats | null {
  return stats.modelCount > 0 || stats.totalSize > 0 ? stats : null
}

function getLoadingTitle(progress: number): string {
  if (progress < 30) return '正在加载AI运行时...'
  if (progress < 80) return '正在准备模型资源...'
  if (progress < 95) return '正在校验模型资源...'
  return '正在初始化AI引擎...'
}

export const useAiStore = defineStore('ai', () => {
  const service = getAIServiceManager()

  const isSupported = service.isSupported
  const isLoading = service.isLoading
  const isModelLoaded = service.isModelLoaded
  const loadProgress = service.loadProgress
  const loadStatus = service.loadStatus
  const error = service.error
  const currentModel = service.currentModel
  const models = ref<ModelInfo[]>([])
  const downloadingModel = ref<string | null>(null)
  const lastRequestedModel = ref<string | null>(null)
  const storageUsage = ref<BrowserStorageEstimate | null>(null)
  const cacheStats = ref<RuntimeCacheStats | null>(null)
  const loadingTitle = computed(() => getLoadingTitle(loadProgress.value))
  const loadingSteps = computed<RuntimeLoadingStep[]>(() => [
    {
      key: 'runtime',
      label: 'AI库加载',
      complete: loadProgress.value >= 30,
    },
    {
      key: 'assets',
      label: '资源准备',
      complete: loadProgress.value >= 80,
    },
    {
      key: 'engine',
      label: '初始化',
      complete: loadProgress.value >= 95,
    },
  ])

  const initialize = async () => {
    await service.initialize()
  }

  const checkSupport = async () => {
    return await service.detectWebGPUSupport()
  }

  const loadModel = async (modelId?: string) => {
    return await service.loadModel(modelId)
  }

  const unloadModel = async () => {
    await service.unloadModel()
  }

  const getAllModels = async () => {
    return await service.getAllModels()
  }

  const getCacheStats = async () => {
    return await service.getCacheStats()
  }

  const clearModelCache = async () => {
    await service.clearModelCache()
  }

  const clearError = () => {
    error.value = null
  }

  const refreshModels = async () => {
    try {
      models.value = await getAllModels()
    } catch (refreshError) {
      models.value = []
      logger.warn('Failed to refresh AI model list', { error: refreshError })
    }
  }

  const refreshStorageUsage = async () => {
    storageUsage.value = await estimateBrowserStorage()
  }

  const refreshCacheStats = async () => {
    try {
      cacheStats.value = normalizeCacheStats(await getCacheStats())
    } catch (refreshError) {
      cacheStats.value = null
      logger.warn('Failed to refresh AI runtime cache stats', {
        error: refreshError,
      })
    }
  }

  const refreshRuntimeMetadata = async () => {
    await Promise.allSettled([
      refreshModels(),
      refreshStorageUsage(),
      refreshCacheStats(),
    ])
  }

  const hydrateRuntime = async () => {
    await checkSupport()
    await refreshRuntimeMetadata()
  }

  const downloadModel = async (modelId: string): Promise<boolean> => {
    lastRequestedModel.value = modelId
    downloadingModel.value = modelId

    try {
      const loaded = await loadModel(modelId)
      await Promise.allSettled([refreshStorageUsage(), refreshCacheStats()])
      return loaded
    } finally {
      downloadingModel.value = null
    }
  }

  const retryLastAction = async (): Promise<boolean> => {
    if (lastRequestedModel.value) {
      return await downloadModel(lastRequestedModel.value)
    }

    await initialize()
    await Promise.allSettled([refreshStorageUsage(), refreshCacheStats()])
    return !error.value
  }

  const unloadCurrentModel = async () => {
    await unloadModel()
    clearError()
    await Promise.allSettled([refreshStorageUsage(), refreshCacheStats()])
  }

  const clearRuntimeCache = async () => {
    await clearCachesByPatterns(['webllm', 'mlc', 'ai-models'])
    await clearModelCache()
    await unloadModel()
    clearError()
    await Promise.allSettled([refreshStorageUsage(), refreshCacheStats()])
  }

  return {
    isSupported,
    isLoading,
    isModelLoaded,
    loadProgress,
    loadStatus,
    error,
    currentModel,
    models,
    downloadingModel,
    storageUsage,
    cacheStats,
    loadingTitle,
    loadingSteps,
    initialize,
    checkSupport,
    loadModel,
    unloadModel,
    getAllModels,
    getCacheStats,
    clearModelCache,
    clearError,
    refreshModels,
    refreshStorageUsage,
    refreshCacheStats,
    refreshRuntimeMetadata,
    hydrateRuntime,
    downloadModel,
    retryLastAction,
    unloadCurrentModel,
    clearRuntimeCache,
  }
})
