/**
 * Database utilities for IndexedDB operations
 *
 * Provides a unified interface for local database operations
 * including stores, indexes, and transactions.
 */

import { logger } from './logger'

export interface StoreConfig {
  name: string
  keyPath: string
  indexes?: Array<{
    name: string
    keyPath: string | string[]
    unique?: boolean
  }>
}

export interface DBConfig {
  name: string
  version: number
  stores: StoreConfig[]
}

export class NexusDB {
  private db: IDBDatabase | null = null
  private dbName: string
  private version: number

  constructor(config: DBConfig) {
    this.dbName = config.name
    this.version = config.version
    this.init(config)
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

  async put<T>(storeName: string, data: T): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite')
      const store = transaction.objectStore(storeName)
      const request = store.put(data)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async get<T>(storeName: string, key: IDBValidKey): Promise<T | null> {
    if (!this.db) throw new Error('Database not initialized')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly')
      const store = transaction.objectStore(storeName)
      const request = store.get(key)

      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
  }

  async getAll<T>(storeName: string): Promise<T[]> {
    if (!this.db) throw new Error('Database not initialized')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly')
      const store = transaction.objectStore(storeName)
      const request = store.getAll()

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async delete(storeName: string, key: IDBValidKey): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite')
      const store = transaction.objectStore(storeName)
      const request = store.delete(key)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async clear(storeName: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite')
      const store = transaction.objectStore(storeName)
      const request = store.clear()

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async query<T>(
    storeName: string,
    indexName?: string,
    range?: IDBKeyRange
  ): Promise<T[]> {
    if (!this.db) throw new Error('Database not initialized')

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly')
      const store = transaction.objectStore(storeName)
      const source = indexName ? store.index(indexName) : store
      const request = source.getAll(range)

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }
}

// Store names enum for type safety
export enum StoreNames {
  BOOKS = 'books',
  CHAPTERS = 'chapters',
  SETTINGS = 'settings',
  CACHE = 'cache',
  OFFLINE_DATA = 'offlineData'
}

// Create singleton instance
let nexusDBInstance: NexusDB | null = null

export function getNexusDB(): NexusDB {
  if (!nexusDBInstance) {
    const config: DBConfig = {
      name: 'nexus-reader',
      version: 1,
      stores: [
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
        {
          name: StoreNames.OFFLINE_DATA,
          keyPath: 'id',
          indexes: [
            { name: 'type', keyPath: 'type' },
            { name: 'priority', keyPath: 'priority' }
          ]
        }
      ]
    }

    nexusDBInstance = new NexusDB(config)
  }

  return nexusDBInstance
}

// Export singleton instance
export const nexusDB = getNexusDB()

export default nexusDB