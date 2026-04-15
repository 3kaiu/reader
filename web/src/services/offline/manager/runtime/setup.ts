import { logger } from '../../../../utils/logger'
import { setupOfflineDetection } from '../network'
import { loadOfflineManagerData } from '../persistence'
import { createOfflineManagerStatusCallbacks, type OfflineManagerRuntimeContext } from './context'

export function initializeOfflineManager(context: OfflineManagerRuntimeContext): Promise<void> {
  setupOfflineDetection({
    statusTracker: context.runtimeState.statusTracker,
    onReconnect: () => context.syncQueuedOperations(),
    onStatusChange: () => context.notifyListeners(),
    onError: error => logger.error('Failed to sync queued operations after reconnect', { error }),
  })

  return loadOfflineManagerData(
    context.runtimeState,
    createOfflineManagerStatusCallbacks(context)
  ).catch(error => {
    logger.error('Failed to load offline data', { error })
  })
}
