import {
  clearCachesByPatterns,
  estimateBrowserStorage,
} from '@/utils/browserStorage'
import { logger } from '@/utils/logger'
import { normalizeCacheStats } from './view'
import type { AiStoreActionContext } from './types'

export function createAiStoreRefreshActions(
  context: AiStoreActionContext,
  actions: {
    getAllModels: () => Promise<Awaited<ReturnType<AiStoreActionContext['service']['getAllModels']>>>
    getCacheStats: () => Promise<Awaited<ReturnType<AiStoreActionContext['service']['getCacheStats']>>>
    clearModelCache: () => Promise<void>
    unloadModel: () => Promise<void>
    clearError: () => void
  },
) {
  const refreshModels = async () => {
    try {
      context.models.value = await actions.getAllModels()
    } catch (refreshError) {
      context.models.value = []
      logger.warn('Failed to refresh AI model list', { error: refreshError })
    }
  }

  const refreshStorageUsage = async () => {
    context.storageUsage.value = await estimateBrowserStorage()
  }

  const refreshCacheStats = async () => {
    try {
      context.cacheStats.value = normalizeCacheStats(await actions.getCacheStats())
    } catch (refreshError) {
      context.cacheStats.value = null
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

  const clearRuntimeCache = async () => {
    await clearCachesByPatterns(['webllm', 'mlc', 'ai-models'])
    await actions.clearModelCache()
    await actions.unloadModel()
    actions.clearError()
    await Promise.allSettled([refreshStorageUsage(), refreshCacheStats()])
  }

  return {
    refreshModels,
    refreshStorageUsage,
    refreshCacheStats,
    refreshRuntimeMetadata,
    clearRuntimeCache,
  }
}
