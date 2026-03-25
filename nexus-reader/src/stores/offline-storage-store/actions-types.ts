import type {
  CachedContent,
  OfflineStatus,
} from '@/services/offline/manager'
import type { OfflineItem } from './types'

export interface OfflineStoreActionHelpers {
  mapOfflineTypeToCachedType: (type: OfflineItem['type']) => CachedContent['type']
  toOfflineItem: (item: CachedContent) => OfflineItem
  syncStateFromManager: (status?: OfflineStatus) => void
  resolveCachedUrl: (item: Omit<OfflineItem, 'timestamp' | 'size'>) => string
}

export interface OfflineStoreActionRuntime {
  hasInitialized: boolean
  initializePromise: Promise<void> | null
  statusListenerRegistered: boolean
}

export function createOfflineStoreActionRuntime(): OfflineStoreActionRuntime {
  return {
    hasInitialized: false,
    initializePromise: null,
    statusListenerRegistered: false,
  }
}
