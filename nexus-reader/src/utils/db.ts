/**
 * Database utilities for IndexedDB operations
 *
 * Provides a unified interface for local database operations
 * including stores, indexes, and transactions.
 */

import { logger } from './logger'

// ========= Domain types stored in IndexedDB =========

type SyncPriority = 'CRITICAL' | 'NORMAL' | 'IDLE'

export interface SyncTask {
  id: string
  type: string
  method: string
  url: string
  data?: unknown
  priority: SyncPriority
  timestamp: number
  retryCount: number
}

interface StoreConfig {
  name: string
  keyPath: string
  indexes?: Array<{
    name: string
    keyPath: string | string[]
    unique?: boolean
  }>
}

interface DBConfig {
  name: string
  version: number
  stores: StoreConfig[]
}

class NexusDB {
  private db: IDBDatabase | null = null
  private dbName: string
  private version: number
  private ready: Promise<void>

  constructor(config: DBConfig) {
    this.dbName = config.name
    this.version = config.version
    this.ready = this.init(config)
  }

  private async init(config: DBConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(config.name, config.version)

      request.onerror = () => {
        logger.error('Failed to open database', { name: config.name })
        reject(request.error)
      }

      request.onsuccess = () => {
        this.db = request.result
        logger.info('Database opened successfully', { name: config.name })
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // Create object stores
        config.stores.forEach(store => {
          if (!db.objectStoreNames.contains(store.name)) {
            const objectStore = db.createObjectStore(store.name, {
              keyPath: store.keyPath
            })

            // Create indexes
            store.indexes?.forEach(index => {
              objectStore.createIndex(index.name, index.keyPath, {
                unique: index.unique ?? false
              })
            })

            logger.info('Object store created', { store: store.name })
          }
        })
      }
    })
  }

  private async ensureReady(): Promise<void> {
    if (this.db) return
    await this.ready
    if (!this.db) throw new Error(`Database not initialized: ${this.dbName}@v${this.version}`)
  }

  async put<T>(storeName: string, data: T): Promise<void> {
    await this.ensureReady()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite')
      const store = transaction.objectStore(storeName)
      const request = store.put(data)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getAll<T>(storeName: string): Promise<T[]> {
    await this.ensureReady()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly')
      const store = transaction.objectStore(storeName)
      const request = store.getAll()

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async delete(storeName: string, key: IDBValidKey): Promise<void> {
    await this.ensureReady()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite')
      const store = transaction.objectStore(storeName)
      const request = store.delete(key)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async clear(storeName: string): Promise<void> {
    await this.ensureReady()

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite')
      const store = transaction.objectStore(storeName)
      const request = store.clear()

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }
}

// Store names enum for type safety
export enum StoreNames {
  // Reading & sync
  PROGRESS = 'progress',
  SYNC_QUEUE = 'syncQueue',

  // Offline cache
  OFFLINE_CONTENT = 'offlineContent',

  BOOKS = 'books',
  CHAPTERS = 'chapters',
  SETTINGS = 'settings',
  CACHE = 'cache',
}

// Create singleton instance
let nexusDBInstance: NexusDB | null = null

function getNexusDB(): NexusDB {
  if (!nexusDBInstance) {
    const config: DBConfig = {
      name: 'nexus-reader',
      version: 2,
      stores: [
        {
          name: StoreNames.PROGRESS,
          keyPath: 'bookId',
          indexes: [{ name: 'updatedAt', keyPath: 'updatedAt' }]
        },
        {
          name: StoreNames.SYNC_QUEUE,
          keyPath: 'id',
          indexes: [
            { name: 'priority', keyPath: 'priority' },
            { name: 'timestamp', keyPath: 'timestamp' }
          ]
        },
        {
          name: StoreNames.OFFLINE_CONTENT,
          keyPath: 'id',
          indexes: [
            { name: 'type', keyPath: 'type' },
            { name: 'priority', keyPath: 'priority' }
          ]
        },
        {
          name: StoreNames.BOOKS,
          keyPath: 'id',
          indexes: [
            { name: 'title', keyPath: 'title' },
            { name: 'author', keyPath: 'author' },
            { name: 'groupId', keyPath: 'groupId' }
          ]
        },
        {
          name: StoreNames.CHAPTERS,
          keyPath: 'id',
          indexes: [
            { name: 'bookId', keyPath: 'bookId' },
            { name: 'title', keyPath: 'title' }
          ]
        },
        {
          name: StoreNames.SETTINGS,
          keyPath: 'key'
        },
        {
          name: StoreNames.CACHE,
          keyPath: 'key',
          indexes: [
            { name: 'url', keyPath: 'url' },
            { name: 'type', keyPath: 'type' }
          ]
        },
      ]
    }

    nexusDBInstance = new NexusDB(config)
  }

  return nexusDBInstance
}

export const nexusDB = getNexusDB()
