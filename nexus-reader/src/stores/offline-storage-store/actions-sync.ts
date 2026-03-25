import { logger } from '@/utils/logger'
import { offlineManager } from '@/services/offline/manager'
import type {
  OfflineStoreActions,
  OfflineStoreState,
} from './types'
import type { OfflineStoreActionHelpers } from './actions-types'

export function createOfflineStoreSyncActions(options: {
  state: OfflineStoreState
  helpers: OfflineStoreActionHelpers
  initialize: () => Promise<void>
}) {
  const syncWithServer: OfflineStoreActions['syncWithServer'] = async () => {
    await options.initialize()

    if (!options.state.offlineState.value.isOnline || !options.state.offlineState.value.syncPending) {
      return
    }

    logger.info('Starting offline data sync...')
    await offlineManager.syncQueuedOperations()
    options.state.offlineState.value.lastSync = Date.now()
    options.helpers.syncStateFromManager()
  }

  const loadCacheIndex: OfflineStoreActions['loadCacheIndex'] = async () => {
    await options.initialize()
  }

  return {
    syncWithServer,
    loadCacheIndex,
  }
}
