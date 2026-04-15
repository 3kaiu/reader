import { offlineManager } from '@/services/offline/manager'
import { logger } from '@/utils/logger'
import type { OfflineStoreState } from './types'
import type { OfflineStoreActionHelpers, OfflineStoreActionRuntime } from './actions-types'

function registerOfflineStoreStatusListener(
  runtime: OfflineStoreActionRuntime,
  helpers: OfflineStoreActionHelpers
): void {
  if (runtime.statusListenerRegistered) {
    return
  }

  offlineManager.addStatusListener(status => {
    helpers.syncStateFromManager(status)
  })
  runtime.statusListenerRegistered = true
}

export function createOfflineStoreInitializer(
  state: OfflineStoreState,
  helpers: OfflineStoreActionHelpers,
  runtime: OfflineStoreActionRuntime
) {
  return async function initialize(): Promise<void> {
    if (runtime.hasInitialized) {
      return
    }

    if (runtime.initializePromise) {
      return await runtime.initializePromise
    }

    runtime.initializePromise = (async () => {
      try {
        registerOfflineStoreStatusListener(runtime, helpers)
        await offlineManager.waitUntilReady()
        helpers.syncStateFromManager()
        runtime.hasInitialized = true

        logger.info('Offline storage initialized from OfflineManager', {
          itemsCount: state.offlineState.value.items.length,
          totalSize: state.offlineState.value.totalSize,
        })
      } finally {
        runtime.initializePromise = null
      }
    })()

    return await runtime.initializePromise
  }
}
