import type { SyncTask } from '../../../utils/db'
import type { OfflineCacheRegistry } from '../cacheRegistry'
import type { OfflineStatusTracker } from '../statusTracker'
import type { CacheableContentPayload, CachedContent, OfflineStatus } from '../types'

export type OfflineOperationInput = {
  type: 'api-request' | 'user-action' | 'sync-data'
  method: string
  url: string
  data?: unknown
}

export type OfflineExportData = {
  operations: SyncTask[]
  content: CachedContent[]
  status: OfflineStatus
}

export interface OfflineManagerRuntimeState {
  operationQueue: SyncTask[]
  cacheRegistry: OfflineCacheRegistry
  statusTracker: OfflineStatusTracker
}

export interface OfflineManagerPersistenceOptions {
  notifyListeners: () => void
}

export interface OfflineManagerCacheOptions {
  persistCachedContent: () => Promise<void>
  notifyListeners: () => void
  fetchContentForCaching: (id: string) => Promise<CacheableContentPayload | null>
}

export interface OfflineManagerQueueOptions {
  refreshPersistedState: () => Promise<void>
  notifyListeners: () => void
}
