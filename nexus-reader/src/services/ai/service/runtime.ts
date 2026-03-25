import { AdaptiveLoader } from '../../../utils/adaptiveAssetLoader'
import { logger } from '../../../utils/logger'
import type { AIServiceState, WebLLMInterface } from './types'

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error ?? '未知错误')
}

export async function detectWebGPUSupport(state: AIServiceState): Promise<boolean> {
  try {
    if (!navigator.gpu) {
      state.isSupported.value = false
      state.error.value = '您的浏览器不支持 WebGPU'
      return false
    }

    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter) {
      state.isSupported.value = false
      state.error.value = '无法获取 GPU 适配器'
      return false
    }

    state.isSupported.value = true
    state.error.value = null
    return true
  } catch (error: unknown) {
    state.isSupported.value = false
    state.error.value = 'WebGPU 检测失败'
    logger.error('[AI Service] WebGPU detection failed:', { error })
    return false
  }
}

export async function loadWebLLMLibrary(
  existingWebLLM: WebLLMInterface | null,
  state: AIServiceState,
): Promise<WebLLMInterface> {
  if (existingWebLLM) {
    return existingWebLLM
  }

  try {
    logger.info('[AI Service] Loading WebLLM library from CDN...')
    state.loadStatus.value = '正在加载AI运行时库...'

    const webllmLib = await AdaptiveLoader.loadHeavyModule(
      '@mlc-ai/web-llm',
      async () => await import('@mlc-ai/web-llm'),
    )

    if (!webllmLib || !webllmLib.CreateWebWorkerMLCEngine) {
      throw new Error('WebLLM library not properly loaded')
    }

    logger.info('[AI Service] WebLLM library loaded successfully')
    return webllmLib
  } catch (error: unknown) {
    logger.error('[AI Service] Failed to load WebLLM library:', { error })

    const errorMessage = getErrorMessage(error)
    state.error.value = `本地 AI 库加载失败: ${errorMessage}。请稍后重试。`
    state.loadStatus.value = '加载失败'

    throw new Error(`AI库加载失败: ${errorMessage}。请稍后重试。`)
  }
}

export async function createAIWorker(existingWorker: Worker | null): Promise<Worker> {
  if (existingWorker) {
    return existingWorker
  }

  try {
    return new Worker(new URL('../../../workers/ai-worker.ts', import.meta.url), {
      type: 'module',
    })
  } catch (error: unknown) {
    logger.error('[AI Service] Failed to create AI worker:', { error })
    throw new Error(`AI Worker创建失败: ${getErrorMessage(error)}`)
  }
}

export async function unloadRuntime(
  state: AIServiceState,
  aiWorker: Worker | null,
): Promise<void> {
  const engine = state.engine.value
  if (!engine) {
    resetRuntimeState(state)
    if (aiWorker) {
      aiWorker.terminate()
    }
    return
  }

  await engine.unload()

  if (engine.terminate) {
    await engine.terminate()
  }

  if (aiWorker) {
    aiWorker.terminate()
  }

  resetRuntimeState(state)
}

export function resetRuntimeState(state: AIServiceState): void {
  state.engine.value = null
  state.currentModel.value = null
  state.isModelLoaded.value = false
  state.loadProgress.value = 0
  state.loadStatus.value = ''
}
