import { createOfflineManagerControllerActions } from './controller-actions'
import type { OfflineManagerController } from './controller-types'
import { createOfflineManagerControllerRuntime } from './controller-runtime'

function createOfflineManagerController(): OfflineManagerController {
  const runtime = createOfflineManagerControllerRuntime()
  return createOfflineManagerControllerActions(runtime)
}

export class OfflineManager implements OfflineManagerController {
  private readonly controller = createOfflineManagerController()

  readonly waitUntilReady = this.controller.waitUntilReady
  readonly getOfflineStatus = this.controller.getOfflineStatus
  readonly isOnlineStatus = this.controller.isOnlineStatus
  readonly clearQueue = this.controller.clearQueue
  readonly queueOperation = this.controller.queueOperation
  readonly cacheContent = this.controller.cacheContent
  readonly removeCachedContent = this.controller.removeCachedContent
  readonly clearCachedContent = this.controller.clearCachedContent
  readonly getCachedContent = this.controller.getCachedContent
  readonly searchCachedContent = this.controller.searchCachedContent
  readonly cleanupExpiredContent = this.controller.cleanupExpiredContent
  readonly addStatusListener = this.controller.addStatusListener
  readonly removeStatusListener = this.controller.removeStatusListener
  readonly syncQueuedOperations = this.controller.syncQueuedOperations
  readonly startAutoSync = this.controller.startAutoSync
  readonly stopAutoSync = this.controller.stopAutoSync
  readonly getOfflineAvailableContent = this.controller.getOfflineAvailableContent
  readonly precacheImportantContent = this.controller.precacheImportantContent
  readonly exportOfflineData = this.controller.exportOfflineData
  readonly importOfflineData = this.controller.importOfflineData
  readonly refreshPersistedState = this.controller.refreshPersistedState
  readonly dispose = this.controller.dispose
}
