import type { IDBPDatabase } from 'idb'
import type { ModelCacheDBSchema } from './types'

export interface ModelCacheManagerState {
  db: IDBPDatabase<ModelCacheDBSchema> | null
  initPromise: Promise<void> | null
}

export function createModelCacheManagerState(): ModelCacheManagerState {
  return {
    db: null,
    initPromise: null,
  }
}
