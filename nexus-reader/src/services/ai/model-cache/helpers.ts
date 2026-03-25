import { openDB, type IDBPDatabase } from 'idb'
import { MODEL_CACHE_STORE_NAME } from './config'
import type {
  CacheStats,
  CachedModelRecord,
  ModelCacheDBSchema,
} from './types'

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error ?? 'Unknown error')
}

export function createEmptyCacheStats(now = Date.now()): CacheStats {
  return {
    totalSize: 0,
    modelCount: 0,
    oldestAccess: now,
    newestAccess: 0,
  }
}

export async function openModelCacheDatabase(
  dbName: string,
  dbVersion: number
): Promise<IDBPDatabase<ModelCacheDBSchema>> {
  return await openDB<ModelCacheDBSchema>(dbName, dbVersion, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(MODEL_CACHE_STORE_NAME)) {
        const store = db.createObjectStore(MODEL_CACHE_STORE_NAME, { keyPath: 'id' })
        store.createIndex('lastAccessed', 'metadata.lastAccessed')
        store.createIndex('timestamp', 'metadata.timestamp')
      }
    },
  })
}

export function calculateCacheStats(models: CachedModelRecord[]): CacheStats {
  const stats = createEmptyCacheStats()
  stats.modelCount = models.length

  for (const model of models) {
    stats.totalSize += model.metadata.size
    stats.oldestAccess = Math.min(stats.oldestAccess, model.metadata.lastAccessed)
    stats.newestAccess = Math.max(stats.newestAccess, model.metadata.lastAccessed)
  }

  return stats
}

export function findExpiredModelIds(
  models: CachedModelRecord[],
  maxModelAge: number,
  now = Date.now()
): string[] {
  return models
    .filter(model => now - model.metadata.lastAccessed > maxModelAge)
    .map(model => model.id)
}
