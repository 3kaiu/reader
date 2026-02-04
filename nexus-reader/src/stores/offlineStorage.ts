/**
 * 离线存储状态管理
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { errorHandler, logger, storage } from '@/utils/unified-utils'

interface OfflineItem {
  id: string
  type: 'book' | 'chapter' | 'cache' | 'settings'
  data: any
  timestamp: number
  size: number
}

interface OfflineState {
  isOnline: boolean
  items: OfflineItem[]
  totalSize: number
  syncPending: boolean
  lastSync: number
}

export const useOfflineStore = defineStore('offlineStorage', () => {
  const state = ref<OfflineState>({
    isOnline: navigator.onLine,
    items: [],
    totalSize: 0,
    syncPending: false,
    lastSync: 0
  })

  const isOnline = computed(() => state.value.isOnline)
  const offlineItemsCount = computed(() => state.value.items.length)
  const totalSize = computed(() => state.value.totalSize)
  const hasPendingSync = computed(() => state.value.syncPending)

  // 监听在线状态变化
  const setupNetworkListener = () => {
    window.addEventListener('online', () => {
      state.value.isOnline = true
      logger.info('Network connection restored')
      autoSync()
    })

    window.addEventListener('offline', () => {
      state.value.isOnline = false
      logger.warn('Network connection lost')
    })
  }

  const storeItem = async (item: Omit<OfflineItem, 'timestamp' | 'size'>) => {
    try {
      const fullItem: OfflineItem = {
        ...item,
        timestamp: Date.now(),
        size: JSON.stringify(item.data).length
      }

      // 检查是否存在相同ID的项目
      const existingIndex = state.value.items.findIndex(i => i.id === item.id)

      if (existingIndex >= 0) {
        // 更新现有项目
        const oldSize = state.value.items[existingIndex].size
        state.value.items[existingIndex] = fullItem
        state.value.totalSize = state.value.totalSize - oldSize + fullItem.size
      } else {
        // 添加新项目
        state.value.items.push(fullItem)
        state.value.totalSize += fullItem.size
      }

      // 本地存储持久化
      await storage.set(`offline_${item.id}`, fullItem)

      // 标记需要同步
      state.value.syncPending = true

      logger.info('Item stored offline', { id: item.id, type: item.type, size: fullItem.size })

    } catch (error) {
      errorHandler.handle(error, { component: 'offline-store', operation: 'storeItem' })
    }
  }

  const getItem = async (id: string): Promise<OfflineItem | null> => {
    try {
      // 首先从内存中查找
      const memoryItem = state.value.items.find(item => item.id === id)
      if (memoryItem) {
        return memoryItem
      }

      // 从本地存储中查找
      const storedItem = await storage.get(`offline_${id}`)
      if (storedItem) {
        return storedItem
      }

      return null
    } catch (error) {
      errorHandler.handle(error, { component: 'offline-store', operation: 'getItem' })
      return null
    }
  }

  const removeItem = async (id: string) => {
    try {
      const index = state.value.items.findIndex(item => item.id === id)
      if (index >= 0) {
        const removedItem = state.value.items.splice(index, 1)[0]
        state.value.totalSize -= removedItem.size

        // 从本地存储中删除
        await storage.remove(`offline_${id}`)

        logger.info('Item removed from offline storage', { id, size: removedItem.size })
      }

      // 检查是否还有待同步项目
      state.value.syncPending = state.value.items.some(item => item.type !== 'cache')

    } catch (error) {
      errorHandler.handle(error, { component: 'offline-store', operation: 'removeItem' })
    }
  }

  const clearAll = async () => {
    try {
      // 清除内存中的项目
      state.value.items = []
      state.value.totalSize = 0
      state.value.syncPending = false

      // 清除本地存储
      for (const item of state.value.items) {
        await storage.remove(`offline_${item.id}`)
      }

      logger.info('All offline items cleared')

    } catch (error) {
      errorHandler.handle(error, { component: 'offline-store', operation: 'clearAll' })
    }
  }

  const syncWithServer = async () => {
    if (!state.value.isOnline || !state.value.syncPending) {
                    return
                }

                try {
      logger.info('Starting offline data sync...')

      const syncItems = state.value.items.filter(item =>
        item.type === 'book' || item.type === 'chapter' || item.type === 'settings'
      )

      if (syncItems.length === 0) {
        state.value.syncPending = false
        return
      }

      // 这里应该调用API进行数据同步
      // const response = await api.post('/sync/offline', { items: syncItems })

      // 模拟同步过程
      await new Promise(resolve => setTimeout(resolve, 1000))

      state.value.lastSync = Date.now()
      state.value.syncPending = false

      logger.info('Offline data sync completed', { itemsCount: syncItems.length })

    } catch (error) {
      errorHandler.handle(error, { component: 'offline-store', operation: 'syncWithServer' })
    }
  }

  const autoSync = async () => {
    if (state.value.isOnline && state.value.syncPending) {
      await syncWithServer()
    }
  }

  // 初始化
  const initialize = async () => {
    try {
      setupNetworkListener()

      // 从本地存储恢复数据
      const storedKeys = await storage.keys()
      const offlineKeys = storedKeys.filter(key => key.startsWith('offline_'))

      for (const key of offlineKeys) {
        try {
          const item = await storage.get(key)
          if (item) {
            state.value.items.push(item)
            state.value.totalSize += item.size
          }
        } catch (error) {
          logger.warn('Failed to restore offline item', { key, error })
        }
      }

      // 检查是否有待同步项目
      state.value.syncPending = state.value.items.some(item => item.type !== 'cache')

      logger.info('Offline storage initialized', {
        itemsCount: state.value.items.length,
        totalSize: state.value.totalSize
      })

    } catch (error) {
      errorHandler.handle(error, { component: 'offline-store', operation: 'initialize' })
    }
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
  }
})