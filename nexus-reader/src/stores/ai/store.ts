/**
 * AI Store
 *
 * Thin Pinia wrapper over the local AI runtime manager.
 */

import { defineStore } from 'pinia'
import { getAIServiceManager } from '@/services/ai/service'

export const useAiStore = defineStore('ai', () => {
  const service = getAIServiceManager()

  const isSupported = service.isSupported
  const isLoading = service.isLoading
  const isModelLoaded = service.isModelLoaded
  const loadProgress = service.loadProgress
  const loadStatus = service.loadStatus
  const error = service.error
  const currentModel = service.currentModel

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

  return {
    isSupported,
    isLoading,
    isModelLoaded,
    loadProgress,
    loadStatus,
    error,
    currentModel,
    initialize,
    checkSupport,
    loadModel,
    unloadModel,
    getAllModels,
    getCacheStats,
    clearModelCache,
    clearError,
  }
})
