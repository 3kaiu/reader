import type { IDBPDatabase } from 'idb'
import { logger } from '@/utils/logger'
import {
  MODEL_CACHE_DB_NAME,
  MODEL_CACHE_DB_VERSION,
} from './config'
import { openModelCacheDatabase } from './helpers'
import type { ModelCacheManagerState } from './state'
import type { ModelCacheDBSchema } from './types'

export async function initializeModelCacheDatabase(
  state: ModelCacheManagerState,
  cleanupExpiredModels: () => Promise<void>,
): Promise<void> {
  if (state.db) {
    return
  }

  if (state.initPromise) {
    return await state.initPromise
  }

  state.initPromise = performModelCacheInitialization(state, cleanupExpiredModels)

  try {
    await state.initPromise
  } finally {
    state.initPromise = null
  }
}

async function performModelCacheInitialization(
  state: ModelCacheManagerState,
  cleanupExpiredModels: () => Promise<void>,
): Promise<void> {
  try {
    state.db = await openModelCacheDatabase(
      MODEL_CACHE_DB_NAME,
      MODEL_CACHE_DB_VERSION,
    )

    logger.info('[Model Cache] Database initialized successfully')
    await cleanupExpiredModels()
  } catch (error: unknown) {
    logger.error('[Model Cache] Failed to initialize database:', { error })
    throw error
  }
}

export async function ensureModelCacheDatabase(
  state: ModelCacheManagerState,
  initialize: () => Promise<void>,
): Promise<IDBPDatabase<ModelCacheDBSchema>> {
  if (!state.db) {
    await initialize()
  }

  return state.db!
}
