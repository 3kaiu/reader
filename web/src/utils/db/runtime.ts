import { logger } from '../logger'
import type { DBConfig } from './types'

const MIGRATION_FLAG_PREFIX = 'nexus_db_migrated'

type LegacyDatabaseHandle = {
  db: IDBDatabase
  existed: boolean
}

export class NexusDB {
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
    await this.migrateLegacyDatabases(config)

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

      request.onupgradeneeded = event => {
        const db = (event.target as IDBOpenDBRequest).result

        config.stores.forEach(store => {
          if (!db.objectStoreNames.contains(store.name)) {
            const objectStore = db.createObjectStore(store.name, {
              keyPath: store.keyPath,
            })

            store.indexes?.forEach(index => {
              objectStore.createIndex(index.name, index.keyPath, {
                unique: index.unique ?? false,
              })
            })

            logger.info('Object store created', { store: store.name })
          }
        })
      }
    })
  }

  private async migrateLegacyDatabases(config: DBConfig): Promise<void> {
    if (!config.legacyNames?.length) {
      return
    }

    for (const legacyName of config.legacyNames) {
      if (!legacyName || legacyName === config.name || this.hasMigrationFlag(legacyName)) {
        continue
      }

      try {
        const legacy = await this.openLegacyDatabase(legacyName)
        if (!legacy?.existed) {
          continue
        }

        await this.copyLegacyStores(config, legacy.db)
        this.setMigrationFlag(legacyName)
        logger.info('Legacy IndexedDB migrated', { from: legacyName, to: config.name })
      } catch (error) {
        logger.warn('Legacy IndexedDB migration skipped', {
          from: legacyName,
          to: config.name,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  private hasMigrationFlag(legacyName: string): boolean {
    if (typeof localStorage === 'undefined') {
      return false
    }

    return localStorage.getItem(`${MIGRATION_FLAG_PREFIX}:${legacyName}:${this.dbName}`) === '1'
  }

  private setMigrationFlag(legacyName: string): void {
    if (typeof localStorage === 'undefined') {
      return
    }

    localStorage.setItem(`${MIGRATION_FLAG_PREFIX}:${legacyName}:${this.dbName}`, '1')
  }

  private async openLegacyDatabase(name: string): Promise<LegacyDatabaseHandle | null> {
    return new Promise((resolve, reject) => {
      let createdDuringOpen = false
      const request = indexedDB.open(name)

      request.onerror = () => reject(request.error)
      request.onupgradeneeded = () => {
        createdDuringOpen = true
      }
      request.onsuccess = async () => {
        const db = request.result
        const existed = !(createdDuringOpen && db.version === 1 && db.objectStoreNames.length === 0)

        if (!existed) {
          db.close()
          try {
            await this.deleteDatabase(name)
          } catch (error) {
            logger.warn('Failed to delete empty legacy IndexedDB shell', {
              name,
              error: error instanceof Error ? error.message : String(error),
            })
          }
          resolve(null)
          return
        }

        resolve({ db, existed: true })
      }
    })
  }

  private async copyLegacyStores(config: DBConfig, legacyDb: IDBDatabase): Promise<void> {
    const targetDb = await this.openDatabase(config)

    try {
      for (const store of config.stores) {
        if (!legacyDb.objectStoreNames.contains(store.name)) {
          continue
        }

        const records = await this.readAllRecords(legacyDb, store.name)
        if (records.length === 0) {
          continue
        }

        await this.writeAllRecords(targetDb, store.name, records)
      }
    } finally {
      legacyDb.close()
      targetDb.close()
    }
  }

  private async openDatabase(config: DBConfig): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(config.name, config.version)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
      request.onupgradeneeded = event => {
        const db = (event.target as IDBOpenDBRequest).result

        config.stores.forEach(store => {
          if (!db.objectStoreNames.contains(store.name)) {
            const objectStore = db.createObjectStore(store.name, {
              keyPath: store.keyPath,
            })

            store.indexes?.forEach(index => {
              objectStore.createIndex(index.name, index.keyPath, {
                unique: index.unique ?? false,
              })
            })
          }
        })
      }
    })
  }

  private async readAllRecords(db: IDBDatabase, storeName: string): Promise<unknown[]> {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readonly')
      const store = transaction.objectStore(storeName)
      const request = store.getAll()

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
  }

  private async writeAllRecords(
    db: IDBDatabase,
    storeName: string,
    records: unknown[]
  ): Promise<void> {
    if (records.length === 0) {
      return
    }

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readwrite')
      const store = transaction.objectStore(storeName)

      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)

      records.forEach(record => {
        store.put(record)
      })
    })
  }

  private async deleteDatabase(name: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
      request.onblocked = () => resolve()
    })
  }

  private async ensureReady(): Promise<void> {
    if (this.db) {
      return
    }

    await this.ready
    if (!this.db) {
      throw new Error(`Database not initialized: ${this.dbName}@v${this.version}`)
    }
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
