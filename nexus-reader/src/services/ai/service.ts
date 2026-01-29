/**
 * AI服务管理器 - 端侧AI优化
 * 集成动态加载器，支持运行时加载AI库和模型
 */

import { ref, shallowRef } from 'vue'
import { AdaptiveLoader } from '../../utils/adaptiveAssetLoader'
import { logger } from '../../utils/logger'
import { syncChannel } from '../../utils/broadcast'
import { getDefaultModel, saveLastModel, getAllModels } from '../../stores/ai/models'
import { modelCacheManager } from './modelCache'
import type { AIRequestParams, ModelInfo } from '@/types/ai'

// WebGPU 类型声明
declare global {
  interface Navigator {
    gpu?: {
      requestAdapter(): Promise<GPUAdapter | null>
    }
  }
  interface GPUAdapter { }
}

// AI库接口定义
interface WebLLMInterface {
  CreateWebWorkerMLCEngine: (worker: Worker, modelId: string, config?: any) => Promise<MLCEngineInterface>
}

interface MLCEngineInterface {
  chat: {
    completions: {
      create: (params: any) => Promise<any>
    }
  }
  unload: () => Promise<void>
  terminate?: () => Promise<void>
}


// Context Message Type
interface ContextMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * Sliding Window Context Manager
 * Manages token budget for AI conversation history
 */
class ContextManager {
  private history: ContextMessage[] = []
  private readonly MAX_HISTORY_LENGTH = 10
  private readonly SYSTEM_PROMPT = "你是一个专业的小说阅读助手，负责解答用户关于小说剧情、人物和背景的提问。请用简洁、生动的语言回答。"

  /**
   * Add a message to history
   */
  addMessage(role: 'user' | 'assistant', content: string) {
    this.history.push({ role, content })
    // Simple sliding window by count (for now, ideally by tokens)
    if (this.history.length > this.MAX_HISTORY_LENGTH) {
      this.history.shift()
    }
  }

  /**
   * Clear history
   */
  clear() {
    this.history = []
  }

  /**
   * Build full prompt with System + History + New Input
   */
  buildMessages(newInput: string): ContextMessage[] {
    return [
      { role: 'system', content: this.SYSTEM_PROMPT },
      ...this.history,
      { role: 'user', content: newInput }
    ]
  }
}

/**
 * AI服务管理器类
 */
export class AIServiceManager {
  private static instance: AIServiceManager

  // 状态管理
  public readonly isSupported = ref(false)
  public readonly isLoading = ref(false)
  public readonly isModelLoaded = ref(false)
  public readonly loadProgress = ref(0)
  public readonly loadStatus = ref('')
  public readonly error = ref<string | null>(null)
  public readonly currentModel = ref<string | null>(null)

  // AI引擎实例
  private engine = shallowRef<MLCEngineInterface | null>(null)
  private webllm: WebLLMInterface | null = null
  private aiWorker: Worker | null = null
  private contextManager = new ContextManager()

  // 自动卸载定时器
  private autoUnloadTimer: ReturnType<typeof setTimeout> | null = null
  private readonly AUTO_UNLOAD_TIMEOUT = 5 * 60 * 1000 // 5分钟

  // 性能监控
  public readonly performance = ref({
    tokensPerSecond: 0,
    totalTokens: 0,
    generationTime: 0,
    lastUpdated: 0,
  })

  private constructor() {
    this.initializeEventListeners()
  }

  static getInstance(): AIServiceManager {
    if (!AIServiceManager.instance) {
      AIServiceManager.instance = new AIServiceManager()
    }
    return AIServiceManager.instance
  }

  /**
   * 初始化AI服务
   */
  async initialize(): Promise<void> {
    logger.info('[AI Service] Initializing AI service manager...')

    try {
      // 初始化模型缓存管理器
      await modelCacheManager.initialize()

      // 检测WebGPU支持
      const supported = await this.detectWebGPUSupport()
      if (!supported) {
        logger.warn('[AI Service] WebGPU not supported, AI features will be limited')
        return
      }

      // 预热缓存（可选）
      const recommendedModels = await this.getRecommendedModels()
      const topModels = recommendedModels.slice(0, 2) // 只预热前2个推荐模型
      if (topModels.length > 0) {
        await modelCacheManager.warmupCache(topModels.map(m => m.id))
      }

      logger.info('[AI Service] AI service manager initialized successfully')
    } catch (error) {
      logger.error('[AI Service] Failed to initialize AI service:', error)
      this.error.value = `初始化失败: ${error instanceof Error ? error.message : '未知错误'}`
    }
  }

  /**
   * 检测WebGPU支持
   */
  async detectWebGPUSupport(): Promise<boolean> {
    try {
      if (!navigator.gpu) {
        this.isSupported.value = false
        this.error.value = '您的浏览器不支持 WebGPU'
        return false
      }

      const adapter = await navigator.gpu.requestAdapter()
      if (!adapter) {
        this.isSupported.value = false
        this.error.value = '无法获取 GPU 适配器'
        return false
      }

      this.isSupported.value = true
      this.error.value = null
      return true
    } catch (error) {
      this.isSupported.value = false
      this.error.value = 'WebGPU 检测失败'
      logger.error('[AI Service] WebGPU detection failed:', error as Error)
      return false
    }
  }

  /**
   * 动态加载WebLLM库
   */
  private async loadWebLLMLibrary(): Promise<WebLLMInterface> {
    if (this.webllm) {
      return this.webllm
    }

    try {
      logger.info('[AI Service] Loading WebLLM library from CDN...')

      this.loadStatus.value = '正在加载AI运行时库...'

      // 使用 AdaptiveLoader 加载 WebLLM
      const webllmLib = await AdaptiveLoader.loadHeavyModule('@mlc-ai/web-llm', async () => {
        const module = await import('@mlc-ai/web-llm')
        return module
      })

      if (!webllmLib || !webllmLib.CreateWebWorkerMLCEngine) {
        throw new Error('WebLLM library not properly loaded')
      }

      this.webllm = webllmLib
      logger.info('[AI Service] WebLLM library loaded successfully')

      return webllmLib
    } catch (error) {
      logger.error('[AI Service] Failed to load WebLLM library:', error as Error)

      // 降级策略：提示用户使用云端 AI 或稍后重试
      const errorMessage = error instanceof Error ? error.message : '未知错误'
      this.error.value = `本地 AI 库加载失败: ${errorMessage}。您可以使用云端 AI 功能，或稍后重试。`
      this.loadStatus.value = '加载失败，建议使用云端 AI'

      // 不抛出错误，允许用户继续使用其他功能
      // 如果后续需要本地 AI，可以再次尝试加载
      throw new Error(`AI库加载失败: ${errorMessage}。请使用云端 AI 功能或稍后重试。`)
    }
  }

  /**
   * 动态下载和缓存模型
   */
  private async downloadAndCacheModel(modelId: string): Promise<void> {
    try {
      // 检查是否已缓存
      const isCached = await modelCacheManager.isModelCached(modelId)
      if (isCached) {
        logger.info(`[AI Service] Model ${modelId} already cached`)
        return
      }

      this.loadStatus.value = '正在下载模型...'
      this.loadProgress.value = 10

      // 构建模型下载URL（这里使用WebLLM的模型URL格式）
      const modelUrl = `https://huggingface.co/mlc-ai/${modelId}/resolve/main/params_shard_*.bin`

      // 实际实现中，这里会从WebLLM获取正确的模型URL和分片信息
      // 为了演示，我们模拟下载过程
      logger.info(`[AI Service] Downloading model ${modelId} from ${modelUrl}`)

      // 模拟下载进度
      for (let progress = 10; progress <= 80; progress += 10) {
        this.loadProgress.value = progress
        this.loadStatus.value = `下载模型中... ${progress}%`
        await new Promise(resolve => setTimeout(resolve, 100)) // 模拟下载时间
      }

      // 在实际实现中，这里会是真实的模型数据
      const mockModelData = new ArrayBuffer(1024 * 1024) // 1MB 模拟数据

      // 缓存模型
      await modelCacheManager.cacheModel(modelId, mockModelData, {
        version: '1.0.0',
        checksum: 'mock-checksum'
      })

      this.loadProgress.value = 90
      this.loadStatus.value = '模型缓存完成'

      logger.info(`[AI Service] Model ${modelId} downloaded and cached successfully`)
    } catch (error) {
      logger.error(`[AI Service] Failed to download and cache model ${modelId}:`, error as Error)
      throw new Error(`模型下载失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  /**
   * 从缓存加载模型
   */
  private async loadModelFromCache(modelId: string): Promise<ArrayBuffer | null> {
    try {
      const cachedData = await modelCacheManager.getCachedModel(modelId)
      if (cachedData) {
        logger.info(`[AI Service] Loaded model ${modelId} from cache`)
        this.loadStatus.value = '从缓存加载模型...'
        this.loadProgress.value = 95
      }
      return cachedData
    } catch (error) {
      logger.error(`[AI Service] Failed to load model ${modelId} from cache:`, error as Error)
      return null
    }
  }

  /**
   * 创建AI Worker
   */
  private async createAIWorker(): Promise<Worker> {
    if (this.aiWorker) {
      return this.aiWorker
    }

    try {
      // 动态创建Worker，避免构建时打包
      const workerCode = `
        // AI Worker - 动态生成
        import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm'
        
        const handler = new WebWorkerMLCEngineHandler()
        
        self.onmessage = (msg) => {
          handler.onmessage(msg)
        }
      `

      const blob = new Blob([workerCode], { type: 'application/javascript' })
      const workerUrl = URL.createObjectURL(blob)

      this.aiWorker = new Worker(workerUrl, { type: 'module' })

      // 清理URL对象
      this.aiWorker.addEventListener('error', () => {
        URL.revokeObjectURL(workerUrl)
      })

      return this.aiWorker
    } catch (error) {
      logger.error('[AI Service] Failed to create AI worker:', error as Error)
      throw new Error(`AI Worker创建失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  /**
   * 加载模型
   */
  async loadModel(modelId?: string): Promise<boolean> {
    // 如果没有提供 modelId，获取默认模型
    const targetModelId = modelId || await getDefaultModel()

    if (this.isLoading.value) {
      logger.warn('[AI Service] Model loading already in progress')
      return false
    }

    // 检测WebGPU支持
    if (!this.isSupported.value) {
      const supported = await this.detectWebGPUSupport()
      if (!supported) {
        return false
      }
    }

    this.isLoading.value = true
    this.loadProgress.value = 0
    this.loadStatus.value = '初始化...'
    this.error.value = null

    try {
      // 使用Web锁确保只有一个加载过程
      const { webLocks } = await import('@/utils/webLocks')

      return await webLocks.withExclusive('ai-engine-load', async () => {
        // 再次检查是否已加载
        if (this.isModelLoaded.value && this.currentModel.value === targetModelId) {
          this.isLoading.value = false
          return true
        }

        // 1. 检查模型缓存
        const cachedModelData = await this.loadModelFromCache(targetModelId)
        if (!cachedModelData) {
          // 2. 下载并缓存模型
          await this.downloadAndCacheModel(targetModelId)
        }

        // 3. 动态加载WebLLM库
        const webllmLib = await this.loadWebLLMLibrary()

        // 4. 创建AI Worker
        this.loadStatus.value = '创建AI Worker...'
        this.loadProgress.value = 30
        const worker = await this.createAIWorker()

        // 5. 创建引擎实例
        this.loadStatus.value = '正在初始化模型...'
        this.loadProgress.value = 40

        const engine = await webllmLib.CreateWebWorkerMLCEngine(
          worker,
          targetModelId,
          {
            initProgressCallback: (report: any) => {
              // 40-100%用于模型初始化
              const modelProgress = 40 + Math.round(report.progress * 60)
              this.loadProgress.value = modelProgress
              this.loadStatus.value = report.text || '初始化模型中...'
            },
          }
        )

        // 6. 设置状态
        this.engine.value = engine
        this.currentModel.value = targetModelId
        this.isModelLoaded.value = true
        this.loadStatus.value = '模型加载完成'
        this.loadProgress.value = 100

        // 7. 保存最后使用的模型
        saveLastModel(targetModelId)

        // 8. 启动自动卸载定时器
        this.resetAutoUnloadTimer()

        // 9. 广播状态
        syncChannel.publish('ai-engine-status', {
          status: 'loaded',
          modelId: targetModelId
        })

        logger.info(`[AI Service] Model ${targetModelId} loaded successfully`)
        return true
      })
    } catch (error) {
      logger.error('[AI Service] Failed to load model:', error as Error)
      this.error.value = `模型加载失败: ${error instanceof Error ? error.message : '未知错误'}`
      return false
    } finally {
      this.isLoading.value = false
    }
  }

  // [Removed misplaced code]

  /**
   * 执行AI推理
   */
  async inference(prompt: string, params?: Partial<AIRequestParams>): Promise<string> {
    if (!this.isReady()) {
      throw new Error('AI引擎未就绪，请先加载模型')
    }

    if (!this.engine.value) {
      throw new Error('AI引擎实例不存在')
    }

    try {
      // 重置自动卸载定时器
      this.resetAutoUnloadTimer()

      const startTime = Date.now()

      // Build messages
      const messages = this.contextManager.buildMessages(prompt)

      // 执行推理
      try {
        const response = await this.engine.value.chat.completions.create({
          messages,
          temperature: params?.temperature || 0.7,
          max_tokens: params?.max_tokens || 2048,
          ...params
        })
        const content = response.choices?.[0]?.message?.content || ''
        return content
      } catch (err) {
        throw err
      }

      // Update Context History
      if (content) {
        this.contextManager.addMessage('user', prompt)
        this.contextManager.addMessage('assistant', content)
      }

      // 更新性能指标
      const endTime = Date.now()
      const generationTime = endTime - startTime

      this.performance.value = {
        tokensPerSecond: response.usage?.total_tokens ?
          (response.usage.total_tokens / generationTime) * 1000 : 0,
        totalTokens: response.usage?.total_tokens || 0,
        generationTime,
        lastUpdated: endTime
      }

      // 返回生成的文本
      return content
    } catch (error) {
      logger.error('[AI Service] Inference failed:', error as Error)
      throw new Error(`AI推理失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  /**
   * Clear context history
   */
  clearContext() {
    this.contextManager.clear()
  }


  /**
   * 获取推荐模型列表
   */
  async getRecommendedModels(): Promise<ModelInfo[]> {
    const models = await getAllModels()
    return models.filter(model => model.recommended)
  }

  /**
   * 获取所有可用模型
   */
  async getAllModels(): Promise<ModelInfo[]> {
    return await getAllModels()
  }

  /**
   * 卸载当前模型
   */
  async unloadModel(): Promise<void> {
    this.clearAutoUnloadTimer()

    if (this.engine.value) {
      try {
        logger.info('[AI Service] Unloading current model...')

        await this.engine.value.unload()

        // 终止Worker
        if (this.engine.value.terminate) {
          await this.engine.value.terminate()
        }

        // 清理Worker
        if (this.aiWorker) {
          this.aiWorker.terminate()
          this.aiWorker = null
        }

        // 广播状态
        syncChannel.publish('ai-engine-status', { status: 'unloaded' })

        logger.info('[AI Service] Model unloaded successfully')
      } catch (error) {
        logger.warn('[AI Service] Error during model unload:', error as Error)
      }

      this.engine.value = null
      this.currentModel.value = null
      this.isModelLoaded.value = false
      this.loadProgress.value = 0
      this.loadStatus.value = ''
    }
  }

  /**
   * 获取缓存统计信息
   */
  async getCacheStats() {
    return await modelCacheManager.getCacheStats()
  }

  /**
   * 清理模型缓存
   */
  async clearModelCache(): Promise<void> {
    await modelCacheManager.clearCache()
    logger.info('[AI Service] Model cache cleared')
  }

  /**
   * 获取已缓存的模型列表
   */
  async getCachedModels(): Promise<string[]> {
    return await modelCacheManager.getCachedModelIds()
  }

  /**
   * 预加载推荐模型
   */
  async preloadRecommendedModels(): Promise<void> {
    const recommended = await this.getRecommendedModels()
    const topModels = recommended.slice(0, 3) // 预加载前3个
    const modelIds = topModels.map(m => m.id)
    await modelCacheManager.warmupCache(modelIds)
  }
  async cleanup(): Promise<void> {
    await this.unloadModel()
    this.clearAutoUnloadTimer()

    // 清理WebLLM库引用
    this.webllm = null

    logger.info('[AI Service] AI service manager cleaned up')
  }

  /**
   * 检查AI引擎是否就绪
   */
  isReady(): boolean {
    return this.isModelLoaded.value && this.engine.value !== null
  }

  // 计算属性
  get engineInstance() {
    return this.engine.value
  }

  // 私有方法

  private initializeEventListeners(): void {
    // 监听页面卸载事件
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.cleanup()
      })
    }
  }

  private resetAutoUnloadTimer(): void {
    this.clearAutoUnloadTimer()
    this.autoUnloadTimer = setTimeout(async () => {
      logger.info('[AI Service] Auto-unloading model after 5 minutes of inactivity')
      await this.unloadModel()
    }, this.AUTO_UNLOAD_TIMEOUT)
  }

  private clearAutoUnloadTimer(): void {
    if (this.autoUnloadTimer) {
      clearTimeout(this.autoUnloadTimer)
      this.autoUnloadTimer = null
    }
  }
}

// 延迟初始化的单例实例
let _aiServiceManager: AIServiceManager | null = null

export function getAIServiceManager(): AIServiceManager {
  if (!_aiServiceManager) {
    _aiServiceManager = AIServiceManager.getInstance()
  }
  return _aiServiceManager
}

// 为了向后兼容，提供一个 getter
export const aiServiceManager = {
  get instance() {
    return getAIServiceManager()
  },
  // 代理所有属性和方法
  get isSupported() { return getAIServiceManager().isSupported },
  get isLoading() { return getAIServiceManager().isLoading },
  get isModelLoaded() { return getAIServiceManager().isModelLoaded },
  get loadProgress() { return getAIServiceManager().loadProgress },
  get loadStatus() { return getAIServiceManager().loadStatus },
  get error() { return getAIServiceManager().error },
  get currentModel() { return getAIServiceManager().currentModel },
  get performance() { return getAIServiceManager().performance },
  initialize: () => getAIServiceManager().initialize(),
  detectWebGPUSupport: () => getAIServiceManager().detectWebGPUSupport(),
  loadModel: (modelId?: string) => getAIServiceManager().loadModel(modelId),
  unloadModel: () => getAIServiceManager().unloadModel(),
  inference: (prompt: string, params?: Partial<AIRequestParams>) => getAIServiceManager().inference(prompt, params),
  isReady: () => getAIServiceManager().isReady(),
  getRecommendedModels: () => getAIServiceManager().getRecommendedModels(),
  getAllModels: () => getAIServiceManager().getAllModels(),
  cleanup: () => getAIServiceManager().cleanup(),
  getCacheStats: () => getAIServiceManager().getCacheStats(),
  clearModelCache: () => getAIServiceManager().clearModelCache(),
  getCachedModels: () => getAIServiceManager().getCachedModels(),
  preloadRecommendedModels: () => getAIServiceManager().preloadRecommendedModels(),
}