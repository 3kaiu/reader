import type { AiStoreActionContext } from './types'

export function createAiStoreServiceActions(context: AiStoreActionContext) {
  const initialize = async () => {
    await context.service.initialize()
  }

  const checkSupport = async () => {
    return await context.service.detectWebGPUSupport()
  }

  const loadModel = async (modelId?: string) => {
    return await context.service.loadModel(modelId)
  }

  const unloadModel = async () => {
    await context.service.unloadModel()
  }

  const getAllModels = async () => {
    return await context.service.getAllModels()
  }

  const getCacheStats = async () => {
    return await context.service.getCacheStats()
  }

  const clearModelCache = async () => {
    await context.service.clearModelCache()
  }

  const clearError = () => {
    context.error.value = null
  }

  return {
    initialize,
    checkSupport,
    loadModel,
    unloadModel,
    getAllModels,
    getCacheStats,
    clearModelCache,
    clearError,
  }
}
