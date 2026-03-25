import { logger } from '@/utils/logger'
import {
  MODEL_CACHE_MAX_MODEL_AGE,
  MODEL_CACHE_STORE_NAME,
} from './config'
import {
  calculateCacheStats,
  createEmptyCacheStats,
  findExpiredModelIds,
  getErrorMessage,
} from './helpers'
import type { ModelCacheManagerState } from './state'
import type { CacheStats } from './types'
import { ensureModelCacheDatabase } from './database'

type InitializeModelCache = () => Promise<void>

export async function isCachedModel(
  state: ModelCacheManagerState,
  initialize: InitializeModelCache,
  modelId: string,
): Promise<boolean> {
  const db = await ensureModelCacheDatabase(state, initialize)

  try {
    const cachedModel = await db.get(MODEL_CACHE_STORE_NAME, modelId)
    return cachedModel !== undefined
  } catch (error: unknown) {
    logger.error(`[Model Cache] Failed to check if model ${modelId} is cached:`, { error })
    return false
  }
}

export async function getModelCacheStats(
  state: ModelCacheManagerState,
  initialize: InitializeModelCache,
): Promise<CacheStats> {
  const db = await ensureModelCacheDatabase(state, initialize)

  try {
    const models = await db.getAll(MODEL_CACHE_STORE_NAME)
    return calculateCacheStats(models)
  } catch (error: unknown) {
    logger.error('[Model Cache] Failed to get cache stats:', { error })
    return createEmptyCacheStats()
  }
}

export async function clearModelCache(
  state: ModelCacheManagerState,
  initialize: InitializeModelCache,
): Promise<void> {
  const db = await ensureModelCacheDatabase(state, initialize)

  try {
    await db.clear(MODEL_CACHE_STORE_NAME)
    logger.info('[Model Cache] Cache cleared successfully')
  } catch (error: unknown) {
    logger.error('[Model Cache] Failed to clear cache:', { error })
    throw error
  }
}

export async function warmupModelCache(
  modelIds: string[],
  isModelCached: (modelId: string) => Promise<boolean>,
): Promise<void> {
  logger.info(`[Model Cache] Starting cache warmup for ${modelIds.length} models`)

  for (const modelId of modelIds) {
    const cached = await isModelCached(modelId)
    if (!cached) {
      logger.info(
        `[Model Cache] Model ${modelId} not cached; skipping warmup because no remote preload source is configured`,
      )
    }
  }
}

export async function removeCachedModel(
  state: ModelCacheManagerState,
  initialize: InitializeModelCache,
  modelId: string,
): Promise<void> {
  const db = await ensureModelCacheDatabase(state, initialize)

  try {
    await db.delete(MODEL_CACHE_STORE_NAME, modelId)
    logger.info(`[Model Cache] Removed cached model ${modelId}`)
  } catch (error: unknown) {
    logger.error(`[Model Cache] Failed to remove cached model ${modelId}:`, { error })
    throw error
  }
}

export async function cleanupExpiredModelCache(
  state: ModelCacheManagerState,
  initialize: InitializeModelCache,
  removeModel: (modelId: string) => Promise<void>,
): Promise<void> {
  const db = await ensureModelCacheDatabase(state, initialize)

  try {
    const models = await db.getAll(MODEL_CACHE_STORE_NAME)
    const expiredModelIds = findExpiredModelIds(models, MODEL_CACHE_MAX_MODEL_AGE)

    for (const modelId of expiredModelIds) {
      await removeModel(modelId)
    }

    if (expiredModelIds.length > 0) {
      logger.info(`[Model Cache] Cleaned up ${expiredModelIds.length} expired models`)
    }
  } catch (error: unknown) {
    logger.error('[Model Cache] Failed to cleanup expired models:', {
      error: getErrorMessage(error),
    })
  }
}
