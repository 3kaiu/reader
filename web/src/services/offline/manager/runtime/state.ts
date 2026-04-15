import { OfflineCacheRegistry } from '../../cacheRegistry'
import { OfflineStatusTracker } from '../../statusTracker'
import type { OfflineManagerRuntimeState } from '../types'

export function createOfflineManagerRuntimeState(): OfflineManagerRuntimeState {
  return {
    operationQueue: [],
    cacheRegistry: new OfflineCacheRegistry(),
    statusTracker: new OfflineStatusTracker(),
  }
}
