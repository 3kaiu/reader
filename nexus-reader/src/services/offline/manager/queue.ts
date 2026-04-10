import { nexusDB, StoreNames } from '../../../utils/db'
import { logger } from '../../../utils/logger'
import { syncManager } from '../../syncManager'
import type {
  OfflineManagerQueueOptions,
  OfflineManagerRuntimeState,
  OfflineOperationInput,
} from './types'

export function clearOfflineQueue(
  state: OfflineManagerRuntimeState,
  options: OfflineManagerQueueOptions
): void {
  state.operationQueue = []
  void nexusDB
    .clear(StoreNames.SYNC_QUEUE)
    .then(() => options.refreshPersistedState())
    .catch(error => logger.error('Failed to clear sync queue', { error }))
  options.notifyListeners()
}

export async function queueOfflineOperation(
  operation: OfflineOperationInput,
  options: Pick<OfflineManagerQueueOptions, 'refreshPersistedState'>
): Promise<void> {
  await syncManager.addTask({
    type: operation.type,
    method: operation.method,
    url: operation.url,
    data: operation.data,
    priority: 'NORMAL',
  })

  await options.refreshPersistedState()
}

export async function syncOfflineQueue(
  options: Pick<OfflineManagerQueueOptions, 'refreshPersistedState'>
): Promise<void> {
  logger.info('🔄 Triggering sync via SyncManager...')
  await syncManager.processQueue()
  await options.refreshPersistedState()
}
