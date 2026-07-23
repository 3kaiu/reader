import type { CachedContent, OfflineStatus } from '../../types'
import {
  cacheOfflineManagerContent,
  cleanupOfflineManagerExpiredContent,
  clearOfflineManagerCachedContent,
  getOfflineManagerAvailableContent,
  getOfflineManagerCachedContent,
  precacheOfflineManagerImportantContent,
  removeOfflineManagerCachedContent,
  searchOfflineManagerCachedContent,
} from './cache'
import {
  addOfflineManagerStatusListener,
  exportOfflineManagerRuntimeData,
  getOfflineManagerRuntimeStatus,
  importOfflineManagerRuntimeData,
  isOfflineManagerRuntimeOnline,
  removeOfflineManagerStatusListener,
} from './status'
import { clearOfflineManagerQueue, queueOfflineManagerOperation } from './queue'
import type { OfflineManagerControllerRuntime } from './controller-runtime'
import type { OfflineManagerController, OfflineManagerImportData } from './controller-types'

export function createOfflineManagerControllerActions(
  runtime: OfflineManagerControllerRuntime
): OfflineManagerController {
  const { runtimeContext, ready, dispose } = runtime

  const waitUntilReady = async () => {
    await ready
  }

  const getOfflineStatus = (): OfflineStatus => getOfflineManagerRuntimeStatus(runtimeContext)

  const isOnlineStatus = (): boolean => isOfflineManagerRuntimeOnline(runtimeContext)

  const clearQueue = () => {
    clearOfflineManagerQueue(runtimeContext)
  }

  const queueOperation = async (
    operation: Parameters<OfflineManagerController['queueOperation']>[0]
  ) => {
    await queueOfflineManagerOperation(runtimeContext, operation)
  }

  const cacheContent = (content: Omit<CachedContent, 'timestamp'>) => {
    cacheOfflineManagerContent(runtimeContext, content)
  }

  const removeCachedContent = async (id: string) => {
    await removeOfflineManagerCachedContent(runtimeContext, id)
  }

  const clearCachedContent = async () => {
    await clearOfflineManagerCachedContent(runtimeContext)
  }

  const getCachedContent = (id: string) => getOfflineManagerCachedContent(runtimeContext, id)

  const searchCachedContent = (type?: string, query?: string) =>
    searchOfflineManagerCachedContent(runtimeContext, type, query)

  const cleanupExpiredContent = (maxAge = 7 * 24 * 60 * 60 * 1000) => {
    cleanupOfflineManagerExpiredContent(runtimeContext, maxAge)
  }

  const addStatusListener = (listener: (status: OfflineStatus) => void) => {
    addOfflineManagerStatusListener(runtimeContext, listener)
  }

  const removeStatusListener = (listener: (status: OfflineStatus) => void) => {
    removeOfflineManagerStatusListener(runtimeContext, listener)
  }

  const syncQueuedOperations = async () => {
    await runtimeContext.syncQueuedOperations()
  }

  const startAutoSync = () => {
    // SyncManager 负责轮询，这里保留兼容入口
  }

  const stopAutoSync = () => {
    // SyncManager 负责轮询，这里暂不处理
  }

  const getOfflineAvailableContent = () => getOfflineManagerAvailableContent(runtimeContext)

  const precacheImportantContent = async (contentIds: string[]) => {
    await precacheOfflineManagerImportantContent(runtimeContext, contentIds)
  }

  const exportOfflineData = () => exportOfflineManagerRuntimeData(runtimeContext)

  const importOfflineData = (data: OfflineManagerImportData) => {
    importOfflineManagerRuntimeData(runtimeContext, data)
  }

  const refreshPersistedState = async () => {
    await runtimeContext.refreshPersistedState()
  }

  return {
    waitUntilReady,
    getOfflineStatus,
    isOnlineStatus,
    clearQueue,
    queueOperation,
    cacheContent,
    removeCachedContent,
    clearCachedContent,
    getCachedContent,
    searchCachedContent,
    cleanupExpiredContent,
    addStatusListener,
    removeStatusListener,
    syncQueuedOperations,
    startAutoSync,
    stopAutoSync,
    getOfflineAvailableContent,
    precacheImportantContent,
    exportOfflineData,
    importOfflineData,
    refreshPersistedState,
    dispose,
  }
}
