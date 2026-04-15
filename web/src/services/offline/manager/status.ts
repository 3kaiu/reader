import { logger } from '../../../utils/logger'
import type { OfflineStatus } from '../types'
import type { OfflineManagerRuntimeState } from './types'

export function getOfflineManagerStatus(state: OfflineManagerRuntimeState): OfflineStatus {
  return state.statusTracker.getStatus(state.operationQueue.length, state.cacheRegistry.size())
}

export function isOfflineManagerOnline(state: OfflineManagerRuntimeState): boolean {
  return state.statusTracker.isCurrentlyOnline()
}

export function addOfflineStatusListener(
  state: OfflineManagerRuntimeState,
  listener: (status: OfflineStatus) => void
): void {
  state.statusTracker.addListener(listener)
}

export function removeOfflineStatusListener(
  state: OfflineManagerRuntimeState,
  listener: (status: OfflineStatus) => void
): void {
  state.statusTracker.removeListener(listener)
}

export function notifyOfflineStatusListeners(state: OfflineManagerRuntimeState): void {
  state.statusTracker.notify(state.operationQueue.length, state.cacheRegistry.size(), error =>
    logger.error('Offline status listener error:', { error })
  )
}
