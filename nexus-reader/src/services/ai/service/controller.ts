import { createAIServiceState } from './state'
import { createAIServiceControllerActions } from './controller-actions'
import type { AIServiceController } from './controller-types'
import { createAIServiceControllerRuntime } from './controller-runtime'

function createAIServiceController(): AIServiceController {
  const state = createAIServiceState()
  const runtime = createAIServiceControllerRuntime()
  const actions = createAIServiceControllerActions(state, runtime)

  return {
    isSupported: state.isSupported,
    isLoading: state.isLoading,
    isModelLoaded: state.isModelLoaded,
    loadProgress: state.loadProgress,
    loadStatus: state.loadStatus,
    error: state.error,
    currentModel: state.currentModel,
    ...actions,
  }
}

export class AIServiceManager implements AIServiceController {
  private readonly controller = createAIServiceController()

  readonly isSupported = this.controller.isSupported
  readonly isLoading = this.controller.isLoading
  readonly isModelLoaded = this.controller.isModelLoaded
  readonly loadProgress = this.controller.loadProgress
  readonly loadStatus = this.controller.loadStatus
  readonly error = this.controller.error
  readonly currentModel = this.controller.currentModel
  readonly initialize = this.controller.initialize
  readonly detectWebGPUSupport = this.controller.detectWebGPUSupport
  readonly loadModel = this.controller.loadModel
  readonly unloadModel = this.controller.unloadModel
  readonly getAllModels = this.controller.getAllModels
  readonly getCacheStats = this.controller.getCacheStats
  readonly clearModelCache = this.controller.clearModelCache
  readonly cleanup = this.controller.cleanup
}
