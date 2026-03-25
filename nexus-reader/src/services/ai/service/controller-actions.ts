import { logger } from '../../../utils/logger'
import {
  getAllModels,
} from '../../../stores/ai/models'
import { modelCacheManager } from '../modelCache'
import { initializeAIService } from './bootstrap'
import { registerAIServiceBeforeUnload } from './lifecycle'
import { loadAIModel } from './loader'
import {
  detectWebGPUSupport,
  resetRuntimeState,
  unloadRuntime,
} from './runtime'
import {
  clearAIServiceAutoUnloadTimer,
  createManagedAIWorker,
  loadManagedWebLLMLibrary,
  scheduleAIServiceAutoUnloadTimer,
} from './controller-runtime'
import type { AIServiceController, AIServiceControllerRuntime } from './controller-types'
import type { AIServiceState } from './types'

export function createAIServiceControllerActions(
  state: AIServiceState,
  runtime: AIServiceControllerRuntime,
): Omit<
  AIServiceController,
  | 'isSupported'
  | 'isLoading'
  | 'isModelLoaded'
  | 'loadProgress'
  | 'loadStatus'
  | 'error'
  | 'currentModel'
> {
  const detectSupport = async () => {
    return await detectWebGPUSupport(state)
  }

  const unloadModel = async () => {
    clearAIServiceAutoUnloadTimer(runtime)

    if (state.engine.value || runtime.aiWorker) {
      try {
        logger.info('[AI Service] Unloading current model...')

        await unloadRuntime(state, runtime.aiWorker)
        runtime.aiWorker = null
        logger.info('[AI Service] Model unloaded successfully')
      } catch (error: unknown) {
        logger.warn('[AI Service] Error during model unload:', { error })
      }
    } else {
      resetRuntimeState(state)
    }
  }

  const cleanup = async () => {
    await unloadModel()
    clearAIServiceAutoUnloadTimer(runtime)
    runtime.webllm = null

    logger.info('[AI Service] AI service manager cleaned up')
  }

  registerAIServiceBeforeUnload(() => cleanup())

  return {
    initialize: async () => {
      await initializeAIService({
        state,
        detectWebGPUSupport: () => detectSupport(),
      })
    },
    detectWebGPUSupport: detectSupport,
    loadModel: async modelId => {
      return await loadAIModel({
        state,
        modelId,
        detectWebGPUSupport: () => detectSupport(),
        loadWebLLMLibrary: () => loadManagedWebLLMLibrary(runtime, state),
        createAIWorker: () => createManagedAIWorker(runtime),
        onWorkerReady: worker => {
          runtime.aiWorker = worker
        },
        resetAutoUnloadTimer: () => {
          scheduleAIServiceAutoUnloadTimer(runtime, () => unloadModel())
        },
      })
    },
    unloadModel,
    getAllModels: async () => await getAllModels(),
    getCacheStats: async () => await modelCacheManager.getCacheStats(),
    clearModelCache: async () => {
      await modelCacheManager.clearCache()
      logger.info('[AI Service] Model cache cleared')
    },
    cleanup,
  }
}
