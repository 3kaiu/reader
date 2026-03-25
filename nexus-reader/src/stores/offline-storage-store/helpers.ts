import {
  offlineManager,
  type CachedContent,
  type OfflineStatus,
} from '@/services/offline/manager'
import type {
  OfflineItem,
  OfflineStoreState,
} from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function createOfflineStoreHelpers(state: OfflineStoreState) {
  const mapCachedTypeToOfflineType = (
    type: CachedContent['type'],
  ): OfflineItem['type'] => {
    if (type === 'chapter') return 'chapter'
    if (type === 'book') return 'book'
    return 'cache'
  }

  const mapOfflineTypeToCachedType = (
    type: OfflineItem['type'],
  ): CachedContent['type'] => {
    if (type === 'chapter') return 'chapter'
    if (type === 'book') return 'book'
    return 'api-response'
  }

  const toOfflineItem = (item: CachedContent): OfflineItem => ({
    id: item.id,
    type: mapCachedTypeToOfflineType(item.type),
    data: item.data,
    timestamp: item.timestamp,
    size: item.size,
    bookUrl: item.bookUrl,
    chapterUrl: item.chapterUrl,
  })

  const syncStateFromManager = (status?: OfflineStatus) => {
    const snapshot = offlineManager.exportOfflineData()
    const nextStatus = status ?? snapshot.status
    const items = snapshot.content.map(toOfflineItem)

    state.offlineState.value.isOnline = nextStatus.isOnline
    state.offlineState.value.items = items
    state.offlineState.value.totalSize = items.reduce((sum, item) => sum + item.size, 0)
    state.offlineState.value.syncPending = nextStatus.queuedOperations > 0
  }

  const resolveCachedUrl = (item: Omit<OfflineItem, 'timestamp' | 'size'>) =>
    isRecord(item.data) && typeof item.data.url === 'string' && item.data.url.length > 0
      ? item.data.url
      : item.id

  return {
    mapOfflineTypeToCachedType,
    toOfflineItem,
    syncStateFromManager,
    resolveCachedUrl,
  }
}
