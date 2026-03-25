import {
  cleanupExpiredModelCache,
  clearModelCache,
  getModelCacheStats,
  isCachedModel,
  removeCachedModel,
  warmupModelCache,
} from './cache'
import { initializeModelCacheDatabase } from './database'
import { createModelCacheManagerState } from './state'
import type { CacheStats } from './types'

export class ModelCacheManager {
  private readonly state = createModelCacheManagerState()

  async initialize(): Promise<void> {
    await initializeModelCacheDatabase(this.state, () => this.cleanupExpiredModels())
  }

  async isModelCached(modelId: string): Promise<boolean> {
    return await isCachedModel(this.state, () => this.initialize(), modelId)
  }

  async getCacheStats(): Promise<CacheStats> {
    return await getModelCacheStats(this.state, () => this.initialize())
  }

  async clearCache(): Promise<void> {
    await clearModelCache(this.state, () => this.initialize())
  }

  async warmupCache(modelIds: string[]): Promise<void> {
    await warmupModelCache(modelIds, modelId => this.isModelCached(modelId))
  }

  private async removeCachedModel(modelId: string): Promise<void> {
    await removeCachedModel(this.state, () => this.initialize(), modelId)
  }

  private async cleanupExpiredModels(): Promise<void> {
    await cleanupExpiredModelCache(
      this.state,
      () => this.initialize(),
      modelId => this.removeCachedModel(modelId),
    )
  }
}
