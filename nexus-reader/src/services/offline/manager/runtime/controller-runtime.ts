import {
  fetchOfflineManagerContentForCaching,
} from './cache'
import {
  createOfflineManagerRuntimeContext,
  type OfflineManagerRuntimeContext,
} from './context'
import {
  syncOfflineManagerQueuedOperations,
} from './queue'
import { initializeOfflineManager } from './setup'
import { createOfflineManagerRuntimeState } from './state'
import {
  notifyOfflineManagerStatusListeners,
  persistOfflineManagerCachedContent,
  refreshOfflineManagerRuntimeState,
} from './status'
import type { OfflineManagerRuntimeState } from '../types'

export interface OfflineManagerControllerRuntime {
  runtimeState: OfflineManagerRuntimeState
  runtimeContext: OfflineManagerRuntimeContext
  ready: Promise<void>
}

export function createOfflineManagerControllerRuntime(): OfflineManagerControllerRuntime {
  const runtimeState = createOfflineManagerRuntimeState()
  let runtimeContext!: OfflineManagerRuntimeContext

  const refreshPersistedState = async () => {
    await refreshOfflineManagerRuntimeState(runtimeContext)
  }

  const persistCachedContent = async () => {
    await persistOfflineManagerCachedContent(runtimeContext)
  }

  const notifyListeners = () => {
    notifyOfflineManagerStatusListeners(runtimeContext)
  }

  const syncQueuedOperations = async () => {
    await syncOfflineManagerQueuedOperations(runtimeContext)
  }

  runtimeContext = createOfflineManagerRuntimeContext(runtimeState, {
    refreshPersistedState,
    persistCachedContent,
    notifyListeners,
    fetchContentForCaching: id => fetchOfflineManagerContentForCaching(id),
    syncQueuedOperations,
  })

  return {
    runtimeState,
    runtimeContext,
    ready: initializeOfflineManager(runtimeContext),
  }
}
