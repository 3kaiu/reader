/**
 * 🏥 Storage Health Manager
 * 统一管理和监控阅读器的所有离线存储 (IndexedDB, OPFS, Cache API)
 */
import { opfsStorage } from './opfs'
import { logger } from './logger'

export interface StorageStatus {
  indexedDBSize: number
  opfsFiles: string[]
  cacheNames: string[]
  estimate: StorageEstimate
}

export const storageHealth = {
  /**
   * 获取存储快照
   */
  async getStatus(): Promise<StorageStatus> {
    const estimate = await navigator.storage.estimate()
    const opfsFiles = await opfsStorage.listFiles()
    const cacheNames = await caches.keys()

    return {
      indexedDBSize: 0, // 估算，精准获取需要遍历所有 store
      opfsFiles,
      cacheNames,
      estimate
    }
  },

  /**
   * 清理所有缓存 (深度重置)
   */
  async deepReset(): Promise<void> {
    logger.warn('[Storage] 执行深度重置...')

    // 1. 清理 Cache API
    const cacheNames = await caches.keys()
    await Promise.all(cacheNames.map(name => caches.delete(name)))

    // 2. 清理 OPFS
    const opfsFiles = await opfsStorage.listFiles()
    await Promise.all(opfsFiles.map(file => opfsStorage.deleteFile(file)))

    // 3. 清理 IndexedDB (手动显式删除指定的库)
    const dbs = ['reader-storage', 'reader-insights']
    dbs.forEach(db => indexedDB.deleteDatabase(db))

    logger.info('[Storage] 深度重置完成，请重新加载页面')
  },

  /**
   * 自动优化策略
   */
  async autoOptimize() {
    const { usage, quota } = await navigator.storage.estimate()
    if (usage && quota && (usage / quota > 0.8)) {
      logger.info('[Storage] 存储占用过高 (>80%)，触发自动清理策略')
      // 优先清理章节缓存
      await caches.delete('reader-chapters-v2')
    }
  }
}
