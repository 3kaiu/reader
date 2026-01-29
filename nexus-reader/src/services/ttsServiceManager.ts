/**
 * TTS Service Manager
 * Manages Text-to-Speech functionality with delay loading
 */

import { ref } from 'vue'
import { AdaptiveLoader } from '@/utils/adaptiveAssetLoader'
import { modelCacheManager } from '@/services/ai/modelCache'
import { logger } from '@/utils/logger'
import type { PiperVoice } from '@/types/voice'

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
  private availableVoices: PiperVoice[] = []

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
      if (!this.engine) {
        await this.loadEngine()
      }

      // Check if voice model is cached, if not download it
      if (voiceId) {
        const isCached = await this.isTTSModelCached(voiceId)
        if (!isCached) {
          await this.preloadTTSModel(voiceId)
        }
      }

      // Perform speech synthesis
      let audioBuffer: ArrayBuffer
      audioBuffer = await this.engine.speak(text, { voiceId })

      // Update performance metrics
      const endTime = Date.now()
      const generationTime = endTime - startTime
      this.performance.value = {
        totalCharacters: text.length,
        generationTime,
        charactersPerSecond: text.length / (generationTime / 1000),
        lastUpdated: endTime
      }

      // Play the audio
      await this.playAudio(audioBuffer)

      return audioBuffer
    } catch (err) {
      this.error.value = err instanceof Error ? err.message : 'Speech synthesis failed'
      logger.error('TTS speak failed:', err)
      throw err
    }
  }

  /**
   * Play audio buffer using Web Audio API
   */
  private async playAudio(audioData: ArrayBuffer): Promise<void> {
    try {
      if (!this.audioContext) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
        this.audioContext = new AudioContextClass()
      }

      if (this.audioContext!.state === 'suspended') {
        await this.audioContext!.resume()
      }

      // Decode audio data
      // Note: decodeAudioData detaches the buffer, so we need to copy it if we want to return it later
      // But here we can just use a slice for decoding
      const audioBuffer = await this.audioContext!.decodeAudioData(audioData.slice(0))

      const source = this.audioContext!.createBufferSource()
      source.buffer = audioBuffer
      source.connect(this.audioContext!.destination)

      return new Promise((resolve) => {
        source.onended = () => {
          resolve()
        }
        source.start(0)
      })
    } catch (err) {
      logger.error('Audio playback failed:', err)
      throw new Error('Failed to play audio')
    }
  }

  async getAvailableVoices(): Promise<PiperVoice[]> {
    if (this.availableVoices.length > 0) {
      return [...this.availableVoices]
    }

    try {
      // 动态获取 Piper 语音列表
      const { HuggingFaceVoiceProvider } = await import('piper-tts-web')
      const voiceProvider = new HuggingFaceVoiceProvider()
      const list = await voiceProvider.list()

      // 检查缓存状态
      const cachedModelIds = await this.getCachedTTSModels()

      const voices: PiperVoice[] = []
      for (const [key, data] of Object.entries(list) as [string, any][]) {
        if (!key.includes('zh') && !key.includes('en')) continue // 简化：只保留中英文

        // 检查是否已下载（在 modelCache 中的 tts-{key}）
        const isDesc = data.files && Object.keys(data.files).length > 0

        voices.push({
          key,
          name: key.split('-').pop() || key,
          language: data.language?.code || 'unknown',
          quality: data.quality || 'medium',
          numSpeakers: data.num_speakers || 1,
          files: data.files || {},
          isDownloaded: cachedModelIds.includes(key)
        })
      }

      this.availableVoices = voices
      return voices
    } catch (err) {
      logger.error('Failed to get available voices:', err)
      return []
    }
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
      const piperTTS = await AdaptiveLoader.loadHeavyModule('piper-tts-web', async () => {
        const module = await import('piper-tts-web')
        return module
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
      const errorMessage = err instanceof Error ? err.message : 'Failed to load TTS engine'
      this.error.value = `本地 TTS 库加载失败: ${errorMessage}。将使用浏览器内置语音合成。`
      this.isEngineLoaded.value = false
      this.loadStatus.value = '加载失败，使用浏览器内置 TTS'
      logger.error('TTS engine loading failed:', err)

      // 降级策略：不抛出错误，允许使用浏览器内置 TTS
      // 标记为不支持本地 TTS，但可以使用浏览器 TTS
      this.isSupported.value = false
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

// Export singleton instance via getInstance to ensure single instance
export const ttsServiceManager = TTSServiceManager.getInstance()