/**
 * AI Store
 *
 * Thin Pinia wrapper over the local AI runtime manager.
 */

import { ref } from 'vue'
import { defineStore } from 'pinia'
import { getAIServiceManager } from '@/services/ai/service'
import type { ModelInfo } from '@/types/ai'
import type { BrowserStorageEstimate } from '@/utils/browserStorage'
import { createAiStoreActions } from './store/actions'
import type { AiRuntimeService, RuntimeCacheStats } from './store/types'
import { createLoadingSteps, createLoadingTitle } from './store/view'

export const useAiStore = defineStore('ai', () => {
  const service: AiRuntimeService = getAIServiceManager()

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
  const loadingTitle = createLoadingTitle(loadProgress)
  const loadingSteps = createLoadingSteps(loadProgress)
  const actions = createAiStoreActions({
    service,
    models,
    downloadingModel,
    lastRequestedModel,
    storageUsage,
    cacheStats,
    error,
  })

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
    ...actions,
  }
})
