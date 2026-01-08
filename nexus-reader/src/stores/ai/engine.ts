/**
 * 🔧 AI Engine - WebLLM 引擎管理
 * 从 stores/ai.ts 提取的引擎生命周期管理
 */
import { ref, shallowRef } from 'vue'
import * as webllm from '@mlc-ai/web-llm'
import { logger } from '../../utils/logger'
import { syncChannel } from '../../utils/broadcast'
import { getDefaultModel, saveLastModel } from './models'

// WebGPU 类型声明
declare global {
  interface Navigator {
    gpu?: {
      requestAdapter(): Promise<GPUAdapter | null>
    }
  }
  interface GPUAdapter { }
}

// 引擎状态
export const engineState = {
  isSupported: ref(false),
  isLoading: ref(false),
  isModelLoaded: ref(false),
  loadProgress: ref(0),
  loadStatus: ref(''),
  error: ref<string | null>(null),
  currentModel: ref<string | null>(null),
  engine: shallowRef<webllm.MLCEngineInterface | null>(null),
}

// 性能监控
export const performanceState = ref({
  tokensPerSecond: 0,
  totalTokens: 0,
  generationTime: 0,
  lastUpdated: 0,
})

// 自动卸载定时器
const AUTO_UNLOAD_TIMEOUT = 5 * 60 * 1000 // 5 分钟
let autoUnloadTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 重置自动卸载定时器
 */
export function resetAutoUnloadTimer() {
  clearAutoUnloadTimer()
  autoUnloadTimer = setTimeout(async () => {
    logger.info('[AI Engine] 5分钟无操作，自动卸载模型')
    await unloadModel()
  }, AUTO_UNLOAD_TIMEOUT)
}

/**
 * 清除自动卸载定时器
 */
export function clearAutoUnloadTimer() {
  if (autoUnloadTimer) {
    clearTimeout(autoUnloadTimer)
    autoUnloadTimer = null
  }
}

/**
 * 检测 WebGPU 支持
 */
export async function checkSupport(): Promise<boolean> {
  try {
    if (!navigator.gpu) {
      engineState.isSupported.value = false
      engineState.error.value = '您的浏览器不支持 WebGPU'
      return false
    }
    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter) {
      engineState.isSupported.value = false
      engineState.error.value = '无法获取 GPU 适配器'
      return false
    }
    engineState.isSupported.value = true
    return true
  } catch (e) {
    engineState.isSupported.value = false
    engineState.error.value = 'WebGPU 检测失败'
    return false
  }
}

/**
 * 加载模型 (使用 Web Worker)
 */
export async function loadModel(
  modelId: string = getDefaultModel()
): Promise<boolean> {
  if (engineState.isLoading.value) return false

  // 检测支持
  if (!engineState.isSupported.value) {
    const supported = await checkSupport()
    if (!supported) return false
  }

  engineState.isLoading.value = true
  engineState.loadProgress.value = 0
  engineState.loadStatus.value = '初始化...'
  engineState.error.value = null

  try {
    const { webLocks } = await import('../../utils/webLocks')
    return await webLocks.withExclusive('ai-engine-load', async () => {
      // 在獲取鎖後再次檢查加載狀態
      if (engineState.isModelLoaded.value) {
        engineState.isLoading.value = false
        return true
      }

      // 使用 Web Worker 创建引擎 (推理不阻塞 UI)
      const newEngine = await webllm.CreateWebWorkerMLCEngine(
        new Worker(new URL('../../workers/ai-worker.ts', import.meta.url), {
          type: 'module',
        }),
        modelId,
        {
          initProgressCallback: (report) => {
            engineState.loadProgress.value = Math.round(report.progress * 100)
            engineState.loadStatus.value = report.text
          },
        }
      )

      engineState.engine.value = newEngine
      engineState.currentModel.value = modelId
      engineState.isModelLoaded.value = true
      engineState.loadStatus.value = '模型加载完成'

      // 保存最后使用的模型
      saveLastModel(modelId)

      // 启动自动卸载定时器
      resetAutoUnloadTimer()

      // 广播模型加载状态
      syncChannel.publish('ai-engine-status', { status: 'loaded', modelId: modelId })

      return true
    }) // 移除 ifAvailable，等待锁释放
  } catch (e) {
    engineState.error.value = `模型加载失败: ${e instanceof Error ? e.message : '未知错误'}`
    return false
  } finally {
    engineState.isLoading.value = false
  }
}

/**
 * 卸载模型
 */
export async function unloadModel() {
  clearAutoUnloadTimer()
  if (engineState.engine.value) {
    try {
      await engineState.engine.value.unload()
      // 终止 Web Worker 并释放 WebGPU 资源
      if ('terminate' in engineState.engine.value && typeof engineState.engine.value.terminate === 'function') {
        await engineState.engine.value.terminate()
      }
      // 广播模型卸载状态
      syncChannel.publish('ai-engine-status', { status: 'unloaded' })
    } catch (e) {
      console.warn('[AI Engine] Error unloading model:', e)
    }
    engineState.engine.value = null
    engineState.currentModel.value = null
    engineState.isModelLoaded.value = false
  }
}

/**
 * 获取引擎实例
 */
export function getEngine(): webllm.MLCEngineInterface | null {
  return engineState.engine.value
}

/**
 * 检查模型是否已加载
 */
export function isReady(): boolean {
  return engineState.isModelLoaded.value && engineState.engine.value !== null
}
