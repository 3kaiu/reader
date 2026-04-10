import type { ComputedRef, Ref } from 'vue'

export interface OfflineItem {
  id: string
  type: 'book' | 'chapter' | 'cache' | 'settings'
  data: unknown
  timestamp: number
  size: number
  bookUrl?: string
  chapterUrl?: string
}

export interface OfflineState {
  isOnline: boolean
  items: OfflineItem[]
  totalSize: number
  syncPending: boolean
  lastSync: number
}

export interface OfflineStoreState {
  offlineState: Ref<OfflineState>
}

export interface OfflineStoreView {
  isOnline: ComputedRef<boolean>
  offlineItemsCount: ComputedRef<number>
  totalSize: ComputedRef<number>
  hasPendingSync: ComputedRef<boolean>
}

export interface OfflineStoreActions {
  storeItem(item: Omit<OfflineItem, 'timestamp' | 'size'>): Promise<void>
  getItem(id: string): Promise<OfflineItem | null>
  removeItem(id: string): Promise<void>
  clearAll(): Promise<void>
  syncWithServer(): Promise<void>
  loadCacheIndex(): Promise<void>
  getBookCacheStatus(
    bookUrl: string,
    totalChapters: number
  ): { cached: number; total: number; percentage: number }
}
