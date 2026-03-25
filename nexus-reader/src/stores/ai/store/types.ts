import type { Ref } from 'vue'
import type { ModelInfo } from '@/types/ai'
import type { BrowserStorageEstimate } from '@/utils/browserStorage'

export type RuntimeCacheStats = {
  totalSize: number
  modelCount: number
}

export type RuntimeLoadingStep = {
  key: string
  label: string
  complete: boolean
}

export interface AiRuntimeService {
  isSupported: Ref<boolean>
  isLoading: Ref<boolean>
  isModelLoaded: Ref<boolean>
  loadProgress: Ref<number>
  loadStatus: Ref<string>
  error: Ref<string | null>
  currentModel: Ref<string | null>
  initialize(): Promise<void>
  detectWebGPUSupport(): Promise<boolean>
  loadModel(modelId?: string): Promise<boolean>
  unloadModel(): Promise<void>
  getAllModels(): Promise<ModelInfo[]>
  getCacheStats(): Promise<RuntimeCacheStats>
  clearModelCache(): Promise<void>
}

export interface AiStoreActionContext {
  service: AiRuntimeService
  models: Ref<ModelInfo[]>
  downloadingModel: Ref<string | null>
  lastRequestedModel: Ref<string | null>
  storageUsage: Ref<BrowserStorageEstimate | null>
  cacheStats: Ref<RuntimeCacheStats | null>
  error: Ref<string | null>
}
