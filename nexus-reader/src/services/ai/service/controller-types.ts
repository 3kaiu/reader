import { modelCacheManager } from '../modelCache'
import type { ModelInfo } from '@/types/ai'
import type {
  AIServiceState,
  WebLLMInterface,
} from './types'

export type CacheStatsPromise = ReturnType<typeof modelCacheManager.getCacheStats>

export interface AIServiceController {
  isSupported: AIServiceState['isSupported']
  isLoading: AIServiceState['isLoading']
  isModelLoaded: AIServiceState['isModelLoaded']
  loadProgress: AIServiceState['loadProgress']
  loadStatus: AIServiceState['loadStatus']
  error: AIServiceState['error']
  currentModel: AIServiceState['currentModel']
  initialize: () => Promise<void>
  detectWebGPUSupport: () => Promise<boolean>
  loadModel: (modelId?: string) => Promise<boolean>
  unloadModel: () => Promise<void>
  getAllModels: () => Promise<ModelInfo[]>
  getCacheStats: () => CacheStatsPromise
  clearModelCache: () => Promise<void>
  cleanup: () => Promise<void>
}

export interface AIServiceControllerRuntime {
  webllm: WebLLMInterface | null
  aiWorker: Worker | null
  autoUnloadTimer: ReturnType<typeof setTimeout> | null
}
