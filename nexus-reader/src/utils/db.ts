/**
 * Nexus Unified Database Service
 * Powering persistence for reading progress, offline content, and sync queues.
 * Based on IndexDB (via 'idb' wrapper).
 */

import { openDB, type IDBPDatabase } from 'idb'
import { logger } from './logger'

export const DB_NAME = 'nexus-internal-db'
export const DB_VERSION = 2

export enum StoreNames {
  PROGRESS = 'progress',
  OFFLINE_CONTENT = 'offline_content',
  SYNC_QUEUE = 'sync_queue',
}

export interface ReadingProgress {
  bookId: string
  chapterIndex: number
  scrollPercent: number
  updatedAt: number
}

export interface OfflineContent {
  id: string
  type: string
  url: string
  data: any
  size: number
  priority: number
  timestamp: number
}

export interface SyncTask {
  id: string
  type: string
  method: string
  url: string
  data?: any
  priority: 'CRITICAL' | 'NORMAL' | 'IDLE'
  timestamp: number
  retryCount: number
}

class NexusDatabase {
  private db: IDBPDatabase | null = null

  async getDB(): Promise<IDBPDatabase> {
    if (this.db) return this.db

    this.db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          // Version 1 stores
          db.createObjectStore(StoreNames.PROGRESS, { keyPath: 'bookId' })

          const contentStore = db.createObjectStore(StoreNames.OFFLINE_CONTENT, { keyPath: 'id' })
          contentStore.createIndex('type', 'type')
          contentStore.createIndex('timestamp', 'timestamp')

          const queueStore = db.createObjectStore(StoreNames.SYNC_QUEUE, { keyPath: 'id' })
          queueStore.createIndex('priority', 'priority')
          queueStore.createIndex('timestamp', 'timestamp')
        }
        // Add future migration logic here (oldVersion < 2, etc.)
      },
      blocked() {
        logger.warn('Database access blocked by older version in another tab.')
      },
      blocking() {
        logger.warn('Database needs upgrade, blocking newer connections.')
      },
      terminated() {
        logger.error('Database connection terminated abnormally.')
      },
    })

    return this.db
  }

  // Generic accessors
  async put(storeName: StoreNames, value: any) {
    const db = await this.getDB()
    return db.put(storeName, value)
  }

  async get(storeName: StoreNames, key: string) {
    const db = await this.getDB()
    return db.get(storeName, key)
  }

  async delete(storeName: StoreNames, key: string) {
    const db = await this.getDB()
    return db.delete(storeName, key)
  }

  async getAll(storeName: StoreNames) {
    const db = await this.getDB()
    return db.getAll(storeName)
  }

  async clear(storeName: StoreNames) {
    const db = await this.getDB()
    return db.clear(storeName)
  }
}

export const nexusDB = new NexusDatabase()
