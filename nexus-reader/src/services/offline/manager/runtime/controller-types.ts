import type { CachedContent, OfflineStatus } from '../../types'
import type { OfflineExportData, OfflineManagerRuntimeState, OfflineOperationInput } from '../types'

export interface OfflineManagerImportData {
  operations?: OfflineManagerRuntimeState['operationQueue']
  content?: CachedContent[]
}

export interface OfflineManagerController {
  waitUntilReady: () => Promise<void>
  getOfflineStatus: () => OfflineStatus
  isOnlineStatus: () => boolean
  clearQueue: () => void
  queueOperation: (operation: OfflineOperationInput) => Promise<void>
  cacheContent: (content: Omit<CachedContent, 'timestamp'>) => void
  removeCachedContent: (id: string) => Promise<void>
  clearCachedContent: () => Promise<void>
  getCachedContent: (id: string) => CachedContent | null
  searchCachedContent: (type?: string, query?: string) => CachedContent[]
  cleanupExpiredContent: (maxAge?: number) => void
  addStatusListener: (listener: (status: OfflineStatus) => void) => void
  removeStatusListener: (listener: (status: OfflineStatus) => void) => void
  syncQueuedOperations: () => Promise<void>
  startAutoSync: (_interval?: number) => void
  stopAutoSync: () => void
  getOfflineAvailableContent: () => CachedContent[]
  precacheImportantContent: (contentIds: string[]) => Promise<void>
  exportOfflineData: () => OfflineExportData
  importOfflineData: (data: OfflineManagerImportData) => void
  refreshPersistedState: () => Promise<void>
}
