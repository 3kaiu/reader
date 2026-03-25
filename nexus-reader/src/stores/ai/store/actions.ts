import { createAiStoreRefreshActions } from './actions-refresh'
import { createAiStoreRuntimeActions } from './actions-runtime'
import { createAiStoreServiceActions } from './actions-service'
import type { AiStoreActionContext } from './types'

export function createAiStoreActions(context: AiStoreActionContext) {
  const serviceActions = createAiStoreServiceActions(context)
  const refreshActions = createAiStoreRefreshActions(context, serviceActions)
  const runtimeActions = createAiStoreRuntimeActions(context, {
    initialize: serviceActions.initialize,
    checkSupport: serviceActions.checkSupport,
    loadModel: serviceActions.loadModel,
    unloadModel: serviceActions.unloadModel,
    clearError: serviceActions.clearError,
    refreshStorageUsage: refreshActions.refreshStorageUsage,
    refreshCacheStats: refreshActions.refreshCacheStats,
    refreshRuntimeMetadata: refreshActions.refreshRuntimeMetadata,
  })

  return {
    ...serviceActions,
    ...refreshActions,
    ...runtimeActions,
  }
}
