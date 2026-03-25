import { ModelCacheManager } from './manager'

let modelCacheManagerInstance: ModelCacheManager | null = null

export function getModelCacheManager(): ModelCacheManager {
  if (!modelCacheManagerInstance) {
    modelCacheManagerInstance = new ModelCacheManager()
  }

  return modelCacheManagerInstance
}

export const modelCacheManager = getModelCacheManager()
