import type { DBSchema } from 'idb'

export interface CacheStats {
  totalSize: number
  modelCount: number
  oldestAccess: number
  newestAccess: number
}

export interface CachedModelRecord {
  id: string
  metadata: {
    size: number
    lastAccessed: number
    timestamp: number
  }
}

export interface ModelCacheDBSchema extends DBSchema {
  models: {
    key: string
    value: CachedModelRecord
    indexes: {
      lastAccessed: number
      timestamp: number
    }
  }
}
