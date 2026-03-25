import { logger } from '../../../utils/logger'
import {
  getDefaultModel,
  saveLastModel,
} from '../../../stores/ai/models'
import { getErrorMessage } from './runtime'
import type {
  AIServiceState,
  EngineInitProgressReport,
  WebLLMInterface,
} from './types'

function startModelLoadingState(state: AIServiceState): void {
  state.isLoading.value = true
  state.loadProgress.value = 0
  state.loadStatus.value = '初始化...'
  state.error.value = null
}

async function ensureAIServiceSupported(options: {
  state: AIServiceState
  detectWebGPUSupport: () => Promise<boolean>
}): Promise<boolean> {
  if (options.state.isSupported.value) {
    return true
  }

  return await options.detectWebGPUSupport()
}

export async function loadAIModel(options: {
  state: AIServiceState
  modelId?: string
  detectWebGPUSupport: () => Promise<boolean>
  loadWebLLMLibrary: () => Promise<WebLLMInterface>
  createAIWorker: () => Promise<Worker>
  onWorkerReady: (worker: Worker) => void
  resetAutoUnloadTimer: () => void
}): Promise<boolean> {
  const targetModelId = options.modelId || (await getDefaultModel())

  if (options.state.isLoading.value) {
    logger.warn('[AI Service] Model loading already in progress')
    return false
  }

  if (
    !(await ensureAIServiceSupported({
      state: options.state,
      detectWebGPUSupport: options.detectWebGPUSupport,
    }))
  ) {
    return false
  }

  startModelLoadingState(options.state)

  try {
    const { webLocks } = await import('@/utils/webLocks')

    return await webLocks.withExclusive('ai-engine-load', async () => {
      if (
        options.state.isModelLoaded.value &&
        options.state.currentModel.value === targetModelId
      ) {
        options.state.isLoading.value = false
        return true
      }

      const webllmLib = await options.loadWebLLMLibrary()

      options.state.loadStatus.value = '创建AI Worker...'
      options.state.loadProgress.value = 30
      const worker = await options.createAIWorker()
      options.onWorkerReady(worker)

      options.state.loadStatus.value = '正在初始化模型...'
      options.state.loadProgress.value = 40

      const engine = await webllmLib.CreateWebWorkerMLCEngine(
        worker,
        targetModelId,
        {
          initProgressCallback: (report: EngineInitProgressReport) => {
            const modelProgress = 40 + Math.round(report.progress * 60)
            options.state.loadProgress.value = modelProgress
            options.state.loadStatus.value = report.text || '初始化模型中...'
          },
        },
      )

      options.state.engine.value = engine
      options.state.currentModel.value = targetModelId
      options.state.isModelLoaded.value = true
      options.state.loadStatus.value = '模型加载完成'
      options.state.loadProgress.value = 100

      saveLastModel(targetModelId)
      options.resetAutoUnloadTimer()

      logger.info(`[AI Service] Model ${targetModelId} loaded successfully`)
      return true
    })
  } catch (error: unknown) {
    logger.error('[AI Service] Failed to load model:', { error })
    options.state.error.value = `模型加载失败: ${getErrorMessage(error)}`
    return false
  } finally {
    options.state.isLoading.value = false
  }
}
