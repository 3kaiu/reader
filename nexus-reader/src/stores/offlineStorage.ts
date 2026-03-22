/**
 * 离线存储状态管理
 */
import { defineStore } from 'pinia'
import { ref, computed, readonly } from 'vue'
import { logger } from '@/utils/logger'
import {
  offlineManager,
  type CachedContent,
  type OfflineStatus,
} from '@/services/offline/manager'

interface OfflineItem {
  id: string
  type: 'book' | 'chapter' | 'cache' | 'settings'
  data: any
  timestamp: number
  size: number
  bookUrl?: string
  chapterUrl?: string
}

interface OfflineState {
  isOnline: boolean
  items: OfflineItem[]
  totalSize: number
  syncPending: boolean
  lastSync: number
}

export const useOfflineStore = defineStore('offlineStorage', () => {
  let hasInitialized = false
  let initializePromise: Promise<void> | null = null
  let statusListenerRegistered = false

  const state = ref<OfflineState>({
    isOnline: true,
    items: [],
    totalSize: 0,
    syncPending: false,
    lastSync: 0
  })

  const isOnline = computed(() => state.value.isOnline)
  const offlineItemsCount = computed(() => state.value.items.length)
  const totalSize = computed(() => state.value.totalSize)
  const hasPendingSync = computed(() => state.value.syncPending)

  const mapCachedTypeToOfflineType = (
    type: CachedContent['type']
  ): OfflineItem['type'] => {
    if (type === 'chapter') return 'chapter'
    if (type === 'book') return 'book'
    return 'cache'
  }

  const mapOfflineTypeToCachedType = (
    type: OfflineItem['type']
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

    state.value.isOnline = nextStatus.isOnline
    state.value.items = items
    state.value.totalSize = items.reduce((sum, item) => sum + item.size, 0)
    state.value.syncPending = nextStatus.queuedOperations > 0
  }

  const registerStatusListener = () => {
    if (statusListenerRegistered) {
      return
    }

    offlineManager.addStatusListener(status => {
      syncStateFromManager(status)
    })
    statusListenerRegistered = true
  }

  const storeItem = async (item: Omit<OfflineItem, 'timestamp' | 'size'>) => {
    await initialize()

    const serialized = JSON.stringify(item.data)
    offlineManager.cacheContent({
      id: item.id,
      type: mapOfflineTypeToCachedType(item.type),
      url:
        typeof item.data?.url === 'string' && item.data.url.length > 0
          ? item.data.url
          : item.id,
      data: item.data,
      size: serialized.length * 2,
      priority: item.type === 'chapter' ? 10 : item.type === 'book' ? 8 : 5,
      bookUrl: typeof item.bookUrl === 'string' ? item.bookUrl : undefined,
      chapterUrl: typeof item.chapterUrl === 'string' ? item.chapterUrl : undefined,
    })
    syncStateFromManager()
  }

  const syncWithServer = async () => {
    await initialize()

    if (!state.value.isOnline || !state.value.syncPending) {
      return
    }

    logger.info('Starting offline data sync...')
    await offlineManager.syncQueuedOperations()
    state.value.lastSync = Date.now()
    syncStateFromManager()
  }

  const loadCacheIndex = async () => {
    await initialize()
  }

  const getBookCacheStatus = (bookUrl: string, totalChapters: number) => {
    const cached = state.value.items.filter(
      item =>
        item.type === 'chapter' &&
        item.bookUrl === bookUrl
    ).length

    const safeTotal = Math.max(totalChapters, 0)
    const percentage =
      safeTotal > 0 ? Math.min(100, Math.round((cached / safeTotal) * 100)) : 0

    return {
      cached,
      total: safeTotal,
      percentage,
    }
  }

  // 初始化
  const initialize = async () => {
    if (hasInitialized) {
      return
    }

    if (initializePromise) {
      return initializePromise
    }

    initializePromise = (async () => {
      try {
        registerStatusListener()
        await offlineManager.waitUntilReady()
        syncStateFromManager()
        hasInitialized = true

        logger.info('Offline storage initialized from OfflineManager', {
          itemsCount: state.value.items.length,
          totalSize: state.value.totalSize,
        })
      } finally {
        initializePromise = null
      }
    })()

    return initializePromise
  }

  const getItem = async (id: string): Promise<OfflineItem | null> => {
    await initialize()
    const cachedItem = offlineManager.getCachedContent(id)
    return cachedItem ? toOfflineItem(cachedItem) : null
  }

  const removeItem = async (id: string) => {
    await initialize()
    await offlineManager.removeCachedContent(id)
    syncStateFromManager()
  }

  const clearAll = async () => {
    await initialize()
    await offlineManager.clearCachedContent()
    syncStateFromManager()
  }

  // 自动初始化
  initialize()

  return {
    // State
    state: readonly(state),

    // Getters
    isOnline,
    offlineItemsCount,
    totalSize,
    hasPendingSync,

    // Actions
    storeItem,
    getItem,
    removeItem,
    clearAll,
    syncWithServer
    ,
    loadCacheIndex,
    getBookCacheStatus,
  }
})
