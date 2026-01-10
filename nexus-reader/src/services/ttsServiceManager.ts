/**
 * TTS服务管理器 - 端侧TTS优化
 * 集成动态加载器，支持运行时加载Piper TTS库和模型
 */

import { ref, shallowRef } from 'vue'
import { cdnResourceLoader } from '@/utils/cdnResourceLoader'
import { logger } from '@/utils/logger'
import { syncChannel } from '@/utils/broadcast'
import { modelCacheManager } from '@/utils/modelCacheManager'

// Piper TTS 类型声明
interface PiperTTSInterface {
  PiperWebWorkerEngine: new (config: any) => PiperEngineInterface
  OnnxWebGPUWorkerRuntime: new () => any
  HuggingFaceVoiceProvider: new () => any
}

interface PiperEngineInterface {
  speak: (text: string, voiceId: string) => Promise<AudioBuffer>
  stop: () => void
  dispose: () => Promise<void>
}

/**
 * TTS服务管理器类
 */
export class TTSServiceManager {
  private static instance: TTSServiceManager

  // 状态管理
  public readonly isSupported = ref(true)
  public readonly isLoading = ref(false)
  public readonly isEngineLoaded = ref(false)
  public readonly loadProgress = ref(0)
  public readonly loadStatus = ref('')
  public readonly error = ref<string | null>(null)
  public readonly isSpeaking = ref(false)
  public readonly isPaused = ref(false)
  
  // TTS引擎实例
  private engine = shallowRef<PiperEngineInterface | null>(null)
  private piperTTS: PiperTTSInterface | null = null
  private audioContext: AudioContext | null = null
  private currentSource: AudioBufferSourceNode | null = null

  // 自动卸载定时器
  private autoUnloadTimer: ReturnType<typeof setTimeout> | null = null
  private readonly AUTO_UNLOAD_TIMEOUT = 10 * 60 * 1000 // 10分钟

  // 性能监控
  public readonly performance = ref({
    charactersPerSecond: 0,
    totalCharacters: 0,
    generationTime: 0,
    lastUpdated: 0,
  })

  private constructor() {
    this.initializeEventListeners()
  }

  static getInstance(): TTSServiceManager {
    if (!TTSServiceManager.instance) {
      TTSServiceManager.instance = new TTSServiceManager()
    }
    return TTSServiceManager.instance
  }

  /**
   * 初始化TTS服务
   */
  async initialize(): Promise<void> {
    logger.info('[TTS Service] Initializing TTS service manager...')
    
    try {
      // 初始化模型缓存管理器（如果还未初始化）
      await modelCacheManager.initialize()
      
      // 检测Web Audio API支持
      const supported = this.detectWebAudioSupport()
      if (!supported) {
        logger.warn('[TTS Service] Web Audio API not supported, TTS features will be limited')
        return
      }

      logger.info('[TTS Service] TTS service manager initialized successfully')
    } catch (error) {
      logger.error('[TTS Service] Failed to initialize TTS service:', error)
      this.error.value = `TTS初始化失败: ${error instanceof Error ? error.message : '未知错误'}`
    }
  }

  /**
   * 检测Web Audio API支持
   */
  private detectWebAudioSupport(): boolean {
    try {
      if (!window.AudioContext && !(window as any).webkitAudioContext) {
        this.isSupported.value = false
        this.error.value = '您的浏览器不支持 Web Audio API'
        return false
      }

      this.isSupported.value = true
      this.error.value = null
      return true
    } catch (error) {
      this.isSupported.value = false
      this.error.value = 'Web Audio API 检测失败'
      logger.error('[TTS Service] Web Audio API detection failed:', error as Error)
      return false
    }
  }

  /**
   * 动态加载Piper TTS库
   */
  private async loadPiperTTSLibrary(): Promise<PiperTTSInterface> {
    if (this.piperTTS) {
      return this.piperTTS
    }

    try {
      logger.info('[TTS Service] Loading Piper TTS library from CDN...')
      
      this.loadStatus.value = '正在加载TTS运行时库...'
      
      // 使用CDN资源加载器加载Piper TTS
      const piperLib = await cdnResourceLoader.loadResource('piper-tts-web', {
        timeout: 30000,
        onProgress: (progress) => {
          this.loadProgress.value = Math.round(progress.percentage * 0.4) // 40%用于库加载
          this.loadStatus.value = `加载TTS库: ${progress.status}`
        }
      })

      if (!piperLib || !piperLib.PiperWebWorkerEngine) {
        throw new Error('Piper TTS library not properly loaded')
      }

      this.piperTTS = piperLib
      logger.info('[TTS Service] Piper TTS library loaded successfully')
      
      return piperLib
    } catch (error) {
      logger.error('[TTS Service] Failed to load Piper TTS library:', error as Error)
      throw new Error(`TTS库加载失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  /**
   * 初始化TTS引擎
   */
  async loadEngine(): Promise<boolean> {
    if (this.isEngineLoaded.value) {
      return true
    }

    if (!this.isSupported.value) {
      throw new Error('TTS不受支持')
    }

    this.isLoading.value = true
    this.error.value = null
    this.loadProgress.value = 0

    try {
      // 1. 加载Piper TTS库
      const piperLib = await this.loadPiperTTSLibrary()
      
      // 2. 初始化Audio Context
      this.loadStatus.value = '初始化音频上下文...'
      this.loadProgress.value = 50
      
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      }

      // 3. 创建TTS引擎
      this.loadStatus.value = '创建TTS引擎...'
      this.loadProgress.value = 70
      
      this.engine.value = new piperLib.PiperWebWorkerEngine({
        onnxRuntime: new piperLib.OnnxWebGPUWorkerRuntime(),
        voiceProvider: new piperLib.HuggingFaceVoiceProvider()
      })

      this.loadProgress.value = 100
      this.loadStatus.value = 'TTS引擎就绪'
      this.isEngineLoaded.value = true

      // 广播状态
      syncChannel.publish('tts-engine-status', { status: 'loaded' })

      logger.info('[TTS Service] TTS engine loaded successfully')
      return true
    } catch (error) {
      logger.error('[TTS Service] Failed to load TTS engine:', error as Error)
      this.error.value = `TTS引擎加载失败: ${error instanceof Error ? error.message : '未知错误'}`
      return false
    } finally {
      this.isLoading.value = false
    }
  }

  /**
   * 动态下载和缓存TTS模型
   */
  private async downloadAndCacheTTSModel(voiceId: string): Promise<void> {
    try {
      // 检查是否已缓存
      const isCached = await modelCacheManager.isModelCached(`tts-${voiceId}`)
      if (isCached) {
        logger.info(`[TTS Service] TTS model ${voiceId} already cached`)
        return
      }

      this.loadStatus.value = '正在下载TTS模型...'
      this.loadProgress.value = 60

      // 构建TTS模型下载URL（使用HuggingFace格式）
      const modelUrl = `https://huggingface.co/rhasspy/piper-voices/resolve/main/${voiceId}/${voiceId}.onnx`
      
      logger.info(`[TTS Service] Downloading TTS model ${voiceId} from ${modelUrl}`)
      
      // 使用fetch下载模型
      const response = await fetch(modelUrl)
      if (!response.ok) {
        throw new Error(`Failed to download TTS model: ${response.statusText}`)
      }

      // 获取模型数据
      const modelData = await response.arrayBuffer()
      
      // 缓存模型
      await modelCacheManager.cacheModel(`tts-${voiceId}`, modelData, {
        version: '1.0.0',
        checksum: 'tts-model-checksum',
        type: 'tts-model'
      })

      this.loadProgress.value = 80
      this.loadStatus.value = 'TTS模型缓存完成'
      
      logger.info(`[TTS Service] TTS model ${voiceId} downloaded and cached successfully`)
    } catch (error) {
      logger.error(`[TTS Service] Failed to download and cache TTS model ${voiceId}:`, error as Error)
      throw new Error(`TTS模型下载失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  /**
   * 从缓存加载TTS模型
   */
  private async loadTTSModelFromCache(voiceId: string): Promise<ArrayBuffer | null> {
    try {
      const cachedData = await modelCacheManager.getCachedModel(`tts-${voiceId}`)
      if (cachedData) {
        logger.info(`[TTS Service] Loaded TTS model ${voiceId} from cache`)
        this.loadStatus.value = '从缓存加载TTS模型...'
        this.loadProgress.value = 85
      }
      return cachedData
    } catch (error) {
      logger.error(`[TTS Service] Failed to load TTS model ${voiceId} from cache:`, error as Error)
      return null
    }
  }

  /**
   * 获取可用的TTS语音列表
   */
  getAvailableVoices(): string[] {
    // 返回支持的TTS语音ID列表
    return [
      'zh_CN-huayan-medium',
      'zh_CN-xiaoyan-medium', 
      'zh_CN-xiaoxiao-medium',
      'en_US-amy-medium',
      'en_US-danny-low',
      'en_GB-alan-medium'
    ]
  }

  /**
   * 检查TTS模型是否已缓存
   */
  async isTTSModelCached(voiceId: string): Promise<boolean> {
    return await modelCacheManager.isModelCached(`tts-${voiceId}`)
  }

  /**
   * 预加载TTS模型
   */
  async preloadTTSModel(voiceId: string): Promise<void> {
    try {
      // 检查模型缓存
      let cachedModelData = await this.loadTTSModelFromCache(voiceId)
      if (!cachedModelData) {
        // 下载并缓存模型
        await this.downloadAndCacheTTSModel(voiceId)
        cachedModelData = await this.loadTTSModelFromCache(voiceId)
      }

      logger.info(`[TTS Service] TTS model ${voiceId} preloaded successfully`)
    } catch (error) {
      logger.error(`[TTS Service] Failed to preload TTS model ${voiceId}:`, error as Error)
      throw error
    }
  }

  /**
   * 获取已缓存的TTS模型列表
   */
  async getCachedTTSModels(): Promise<string[]> {
    const allCachedModels = await modelCacheManager.getCachedModelIds()
    return allCachedModels
      .filter(id => id.startsWith('tts-'))
      .map(id => id.replace('tts-', ''))
  }

  /**
   * 移除缓存的TTS模型
   */
  async removeCachedTTSModel(voiceId: string): Promise<void> {
    await modelCacheManager.removeCachedModel(`tts-${voiceId}`)
    logger.info(`[TTS Service] Removed cached TTS model ${voiceId}`)
  }
  async speak(text: string, voiceId?: string): Promise<void> {
    if (!this.isReady()) {
      // 自动加载引擎
      const loaded = await this.loadEngine()
      if (!loaded) {
        throw new Error('TTS引擎加载失败')
      }
    }

    if (!this.engine.value || !this.audioContext) {
      throw new Error('TTS引擎未就绪')
    }

    try {
      // 停止当前播放
      this.stop()

      // 重置自动卸载定时器
      this.resetAutoUnloadTimer()

      const startTime = Date.now()
      this.isSpeaking.value = true
      
      // 使用默认语音或指定语音
      const selectedVoiceId = voiceId || 'zh_CN-huayan-medium'
      
      // 确保TTS模型已加载
      await this.ensureTTSModelLoaded(selectedVoiceId)
      
      // 生成音频
      const audioBuffer = await this.engine.value.speak(text, selectedVoiceId)
      
      // 播放音频
      this.currentSource = this.audioContext.createBufferSource()
      this.currentSource.buffer = audioBuffer
      this.currentSource.connect(this.audioContext.destination)
      
      // 监听播放结束
      this.currentSource.onended = () => {
        this.isSpeaking.value = false
        this.currentSource = null
      }
      
      this.currentSource.start(0)

      // 更新性能指标
      const endTime = Date.now()
      const generationTime = endTime - startTime
      
      this.performance.value = {
        charactersPerSecond: text.length > 0 ? (text.length / generationTime) * 1000 : 0,
        totalCharacters: text.length,
        generationTime,
        lastUpdated: endTime
      }

      logger.info(`[TTS Service] Speech synthesis completed for ${text.length} characters`)
    } catch (error) {
      this.isSpeaking.value = false
      logger.error('[TTS Service] Speech synthesis failed:', error as Error)
      throw new Error(`语音合成失败: ${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  /**
   * 确保TTS模型已加载
   */
  private async ensureTTSModelLoaded(voiceId: string): Promise<void> {
    // 检查模型是否已缓存
    const isCached = await this.isTTSModelCached(voiceId)
    if (!isCached) {
      // 动态下载并缓存模型
      await this.downloadAndCacheTTSModel(voiceId)
    }
  }

  /**
   * 停止语音播放
   */
  stop(): void {
    if (this.currentSource) {
      try {
        this.currentSource.stop()
        this.currentSource.disconnect()
      } catch (error) {
        // 忽略已经停止的错误
      }
      this.currentSource = null
    }
    
    this.isSpeaking.value = false
    this.isPaused.value = false
  }

  /**
   * 暂停/恢复播放
   */
  togglePause(): void {
    if (!this.audioContext) return

    if (this.audioContext.state === 'running') {
      this.audioContext.suspend()
      this.isPaused.value = true
    } else if (this.audioContext.state === 'suspended') {
      this.audioContext.resume()
      this.isPaused.value = false
    }
  }

  /**
   * 卸载TTS引擎
   */
  async unloadEngine(): Promise<void> {
    this.clearAutoUnloadTimer()
    
    // 停止当前播放
    this.stop()
    
    if (this.engine.value) {
      try {
        logger.info('[TTS Service] Unloading TTS engine...')
        
        await this.engine.value.dispose()
        
        // 广播状态
        syncChannel.publish('tts-engine-status', { status: 'unloaded' })
        
        logger.info('[TTS Service] TTS engine unloaded successfully')
      } catch (error) {
        logger.warn('[TTS Service] Error during TTS engine unload:', error as Error)
      }
      
      this.engine.value = null
      this.isEngineLoaded.value = false
      this.loadProgress.value = 0
      this.loadStatus.value = ''
    }

    // 关闭音频上下文
    if (this.audioContext) {
      try {
        await this.audioContext.close()
        this.audioContext = null
      } catch (error) {
        logger.warn('[TTS Service] Error closing audio context:', error as Error)
      }
    }
  }

  /**
   * 获取缓存统计信息
   */
  async getCacheStats() {
    return await modelCacheManager.getCacheStats()
  }

  /**
   * 清理TTS模型缓存
   */
  async clearTTSCache(): Promise<void> {
    // 清理TTS相关的缓存
    const cacheNames = await caches.keys()
    for (const name of cacheNames) {
      if (name.includes('piper') || name.includes('tts')) {
        await caches.delete(name)
      }
    }
    
    logger.info('[TTS Service] TTS cache cleared')
  }

  /**
   * 清理服务
   */
  async cleanup(): Promise<void> {
    await this.unloadEngine()
    this.clearAutoUnloadTimer()
    
    // 清理Piper TTS库引用
    this.piperTTS = null
    
    logger.info('[TTS Service] TTS service manager cleaned up')
  }

  /**
   * 检查TTS引擎是否就绪
   */
  isReady(): boolean {
    return this.isEngineLoaded.value && this.engine.value !== null
  }

  // 计算属性
  get engineInstance() {
    return this.engine.value
  }

  // 私有方法

  private initializeEventListeners(): void {
    // 监听页面卸载事件
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('beforeunload', () => {
        this.cleanup()
      })
    }
  }

  private resetAutoUnloadTimer(): void {
    this.clearAutoUnloadTimer()
    this.autoUnloadTimer = setTimeout(async () => {
      logger.info('[TTS Service] Auto-unloading TTS engine after 10 minutes of inactivity')
      await this.unloadEngine()
    }, this.AUTO_UNLOAD_TIMEOUT)
  }

  private clearAutoUnloadTimer(): void {
    if (this.autoUnloadTimer) {
      clearTimeout(this.autoUnloadTimer)
      this.autoUnloadTimer = null
    }
  }
}

// 导出单例实例
export const ttsServiceManager = TTSServiceManager.getInstance()