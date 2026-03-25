import type { AiStoreActionContext } from './types'

export function createAiStoreRuntimeActions(
  context: AiStoreActionContext,
  actions: {
    initialize: () => Promise<void>
    checkSupport: () => Promise<boolean>
    loadModel: (modelId?: string) => Promise<boolean>
    unloadModel: () => Promise<void>
    clearError: () => void
    refreshStorageUsage: () => Promise<void>
    refreshCacheStats: () => Promise<void>
    refreshRuntimeMetadata: () => Promise<void>
  },
) {
  const hydrateRuntime = async () => {
    await actions.checkSupport()
    await actions.refreshRuntimeMetadata()
  }

  const downloadModel = async (modelId: string): Promise<boolean> => {
    context.lastRequestedModel.value = modelId
    context.downloadingModel.value = modelId

    try {
      const loaded = await actions.loadModel(modelId)
      await Promise.allSettled([actions.refreshStorageUsage(), actions.refreshCacheStats()])
      return loaded
    } finally {
      context.downloadingModel.value = null
    }
  }

  const retryLastAction = async (): Promise<boolean> => {
    if (context.lastRequestedModel.value) {
      return await downloadModel(context.lastRequestedModel.value)
    }

    await actions.initialize()
    await Promise.allSettled([actions.refreshStorageUsage(), actions.refreshCacheStats()])
    return !context.error.value
  }

  const unloadCurrentModel = async () => {
    await actions.unloadModel()
    actions.clearError()
    await Promise.allSettled([actions.refreshStorageUsage(), actions.refreshCacheStats()])
  }

  return {
    hydrateRuntime,
    downloadModel,
    retryLastAction,
    unloadCurrentModel,
  }
}
