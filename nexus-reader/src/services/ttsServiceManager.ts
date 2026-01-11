/**
 * TTS Service Manager
 * Manages Text-to-Speech functionality with delay loading
 */

import { ref, reactive } from 'vue'
import { cdnResourceLoader } from '@/utils/cdnResourceLoader'
import { modelCacheManager } from '@/utils/modelCacheManager'
import { logger } from '@/utils/logger'
import { syncChannel } from '@/utils/broadcast'

export interface TTSPerformance {
  totalCharacters: number
  generationTime: number
  charactersPerSecond: number
  lastUpdated: number
}

export interface TTSEngine {
  speak(text: string, options?: any): Promise<ArrayBuffer>
  dispose(): Promise<void>
}

export class TTSServiceManager {
  private static instance: TTSServiceManager | null = null

  // Reactive state
  public isSupported = ref(false)
  public isLoading = ref(false)
  public isEngineLoaded = ref(false)
  public loadProgress = ref(0)
  public loadStatus = ref('')
  public error = ref<string | null>(null)
  public performance = ref<TTSPerformance>({
    totalCharacters: 0,
    generationTime: 0,
    charactersPerSecond: 0,
    lastUpdated: 0
  })

  private engine: TTSEngine | null = null
  private audioContext: AudioContext | null = null
  private isInitialized = false
  private availableVoices = [
    'zh_CN-huayan-medium',
    'en_US-amy-medium', 
    'zh_CN-xiaoyan-medium',
    'en_US-jenny-medium',
    'zh_CN-xiaoxiao-medium'
  ]

  constructor() {
    this.checkWebAudioSupport()
  }

  static getInstance(): TTSServiceManager {
    if (!TTSServiceManager.instance) {
      TTSServiceManager.instance = new TTSServiceManager()
    }
    return TTSServiceManager.instance
  }

  private checkWebAudioSupport(): void {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      if (AudioContextClass) {
        this.isSupported.value = true
      } else {
        this.isSupported.value = false
        this.error.value = 'Web Audio API not supported'
      }
    } catch (err) {
      this.isSupported.value = false
      this.error.value = 'Web Audio API not available'
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      this.checkWebAudioSupport()
      
      if (!this.isSupported.value) {
        // Don't throw error, just mark as unsupported
        this.error.value = 'TTS not supported in this environment'
        this.isInitialized = true // Mark as initialized even if unsupported
        logger.warn('TTS Service Manager initialized but not supported in this environment')
        return
      }

      // Initialize model cache manager
      await modelCacheManager.initialize()
      
      this.isInitialized = true
      logger.info('TTS Service Manager initialized')
    } catch (err) {
      this.error.value = err instanceof Error ? err.message : 'Initialization failed'
      this.isSupported.value = false
      this.isInitialized = true // Mark as initialized even if failed
      logger.error('TTS initialization failed:', err)
      // Don't throw error, just mark as unsupported
    }
  }

  async speak(text: string, voiceId?: string): Promise<ArrayBuffer> {
    if (!this.isSupported.value) {
      throw new Error('TTS not supported')
    }

    if (!this.isInitialized) {
      await this.initialize()
    }

    const startTime = Date.now()

    try {
      // Load engine if not already loaded
      if (!this.engine) {
        await this.loadEngine()
      }

      if (!this.engine) {
        throw new Error('TTS engine not available')
      }

      // Check if voice model is cached, if not download it
      if (voiceId) {
        const isCached = await this.isTTSModelCached(voiceId)
        if (!isCached) {
          await this.preloadTTSModel(voiceId)
        }
      }

      // Perform speech synthesis
      const audioBuffer = await this.engine.speak(text, { voiceId })
      
      // Update performance metrics
      const endTime = Date.now()
      const generationTime = endTime - startTime
      this.performance.value = {
        totalCharacters: text.length,
        generationTime,
        charactersPerSecond: text.length / (generationTime / 1000),
        lastUpdated: endTime
      }

      return audioBuffer
    } catch (err) {
      this.error.value = err instanceof Error ? err.message : 'Speech synthesis failed'
      logger.error('TTS speak failed:', err)
      throw err
    }
  }

  getAvailableVoices(): string[] {
    return [...this.availableVoices]
  }

  async isTTSModelCached(voiceId: string): Promise<boolean> {
    try {
      return await modelCacheManager.isModelCached(`tts-${voiceId}`)
    } catch (err) {
      logger.error('Failed to check TTS model cache:', err)
      return false
    }
  }

  async preloadTTSModel(voiceId: string): Promise<void> {
    try {
      const modelId = `tts-${voiceId}`
      
      // Check if already cached
      const isCached = await modelCacheManager.isModelCached(modelId)
      if (isCached) {
        return
      }

      // Download model
      const modelUrl = `https://huggingface.co/rhasspy/piper-voices/resolve/main/${voiceId}.onnx`
      const response = await fetch(modelUrl)
      
      if (!response.ok) {
        throw new Error(`Failed to download model: ${response.statusText}`)
      }

      const modelData = await response.arrayBuffer()
      
      // Cache the model
      await modelCacheManager.cacheModel(modelId, modelData, {
        version: '1.0.0',
        type: 'tts-model',
        voiceId,
        size: modelData.byteLength,
        timestamp: Date.now()
      })

      logger.info(`TTS model ${voiceId} preloaded and cached`)
    } catch (err) {
      logger.error(`Failed to preload TTS model ${voiceId}:`, err)
      throw err
    }
  }

  async getCachedTTSModels(): Promise<string[]> {
    try {
      const cachedModelIds = await modelCacheManager.getCachedModelIds()
      return cachedModelIds
        .filter(id => id.startsWith('tts-'))
        .map(id => id.replace('tts-', ''))
    } catch (err) {
      logger.error('Failed to get cached TTS models:', err)
      return []
    }
  }

  async removeCachedTTSModel(voiceId: string): Promise<void> {
    try {
      const modelId = `tts-${voiceId}`
      await modelCacheManager.removeCachedModel(modelId)
      logger.info(`TTS model ${voiceId} removed from cache`)
    } catch (err) {
      logger.error(`Failed to remove TTS model ${voiceId}:`, err)
      throw err
    }
  }

  private async loadEngine(): Promise<void> {
    if (this.isLoading.value) {
      // Wait for current loading to complete
      while (this.isLoading.value) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      return
    }

    this.isLoading.value = true
    this.loadProgress.value = 0
    this.loadStatus.value = 'Loading TTS engine...'
    this.error.value = null

    try {
      // Load TTS library from CDN
      const piperTTS = await cdnResourceLoader.loadResource('piper-tts-web', {
        onProgress: (progress: any) => {
          this.loadProgress.value = Math.round(progress.percentage * 100)
          this.loadStatus.value = progress.status || 'Loading...'
        }
      })

      if (!piperTTS || !piperTTS.PiperWebWorkerEngine) {
        throw new Error('Failed to load TTS library')
      }

      // Create TTS engine instance
      this.engine = new piperTTS.PiperWebWorkerEngine()
      this.isEngineLoaded.value = true
      this.loadProgress.value = 100
      this.loadStatus.value = 'Ready'

      logger.info('TTS engine loaded successfully')
    } catch (err) {
      this.error.value = err instanceof Error ? err.message : 'Failed to load TTS engine'
      this.isEngineLoaded.value = false
      logger.error('TTS engine loading failed:', err)
      throw err
    } finally {
      this.isLoading.value = false
    }
  }

  async cleanup(): Promise<void> {
    try {
      if (this.engine) {
        await this.engine.dispose()
        this.engine = null
      }

      if (this.audioContext) {
        await this.audioContext.close()
        this.audioContext = null
      }

      this.isEngineLoaded.value = false
      this.loadProgress.value = 0
      this.loadStatus.value = ''
      this.error.value = null

      logger.info('TTS service cleaned up')
    } catch (err) {
      logger.error('TTS cleanup failed:', err)
    }
  }
}

// Export singleton instance
export const ttsServiceManager = new TTSServiceManager()