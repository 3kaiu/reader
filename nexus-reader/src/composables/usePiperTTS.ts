/**
 * 🎙️ usePiperTTS - 高质量本地 Piper TTS 引擎
 * 处理 WASM 加载、模型下载、音频生成与播放
 */
import { ref, shallowRef } from 'vue'
import { logger } from '../utils/logger'

// 动态导入的模块引用
let piperModule: any = null

async function getPiperModule() {
  if (!piperModule) {
    piperModule = await import('piper-tts-web')
  }
  return piperModule
}

// 语音模型类型定义
export interface PiperVoice {
  key: string
  name: string
  language: string
  quality: 'x-low' | 'low' | 'medium' | 'high'
  fileSize: string
  isDownloaded: boolean
}

export function usePiperTTS() {
  const isSupported = ref(true)
  const isLoaded = ref(false)
  const isLoading = ref(false)
  const engine = shallowRef<any>(null)
  let voiceProvider: any = null

  const isSpeaking = ref(false)
  const isPaused = ref(false)

  // 音频上下文用于手动播放
  let audioContext: AudioContext | null = null
  let currentSource: AudioBufferSourceNode | null = null

  /**
   * 初始化引擎
   */
  async function init() {
    if (engine.value) return
    isLoading.value = true
    try {
      const { webLocks } = await import('../utils/webLocks')
      await webLocks.withExclusive('piper-tts-load', async () => {
        if (engine.value) return

        const { PiperWebWorkerEngine, OnnxWebGPUWorkerRuntime, HuggingFaceVoiceProvider } = await getPiperModule()
        voiceProvider = new HuggingFaceVoiceProvider()

        // 优先试用 WebGPU 运行时，如果不支持会自动降级（piper-tts-web 内部处理）
        engine.value = new PiperWebWorkerEngine({
          onnxRuntime: new OnnxWebGPUWorkerRuntime(),
          voiceProvider,
        })
        isLoaded.value = true
      }, { ifAvailable: true })
    } catch (e) {
      logger.error('Piper TTS 初始化失败', e as Error)
      isSupported.value = false
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 生成并播放音频
   */
  async function speak(text: string, voiceId: string, speakerId = 0) {
    if (!engine.value) await init()
    if (!engine.value) return

    stop()
    isSpeaking.value = true
    isPaused.value = false

    try {
      const response = await engine.value.generate(text, voiceId, speakerId)

      // 转换 blob 为 AudioBuffer 并播放
      if (!audioContext) audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()

      const arrayBuffer = await response.blob.arrayBuffer()
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

      currentSource = audioContext.createBufferSource()
      currentSource.buffer = audioBuffer
      currentSource.connect(audioContext.destination)

      currentSource.onended = () => {
        isSpeaking.value = false
        currentSource = null
      }

      currentSource.start(0)
    } catch (e) {
      logger.error('Piper TTS 生成失败', e as Error)
      isSpeaking.value = false
    }
  }

  /**
   * 停止播放
   */
  function stop() {
    if (currentSource) {
      currentSource.stop()
      currentSource = null
    }
    isSpeaking.value = false
    isPaused.value = false
  }

  /**
   * 暂停/恢复 (Web Audio API 实现)
   */
  function togglePause() {
    if (!audioContext) return
    if (audioContext.state === 'running') {
      audioContext.suspend()
      isPaused.value = true
    } else if (audioContext.state === 'suspended') {
      audioContext.resume()
      isPaused.value = false
    }
  }

  /**
   * 获取可用语音列表 (支持 OPFS 检查)
   */
  async function getVoices(): Promise<PiperVoice[]> {
    try {
      if (!voiceProvider) {
        const { HuggingFaceVoiceProvider } = await getPiperModule()
        voiceProvider = new HuggingFaceVoiceProvider()
      }
      const list = await voiceProvider.list()
      const { opfsStorage } = await import('../utils/opfs')

      const cached = await caches.open('piper-voices')
      const keys = await cached.keys()
      const cachedUrls = new Set(keys.map(k => k.url))

      const voices: PiperVoice[] = []

      for (const [key, data] of Object.entries(list) as [string, any][]) {
        // 检查 OPFS 或 Cache API
        const isUrlInCache = cachedUrls.has(data.files?.[0] || '')
        const isFileInOpfs = await opfsStorage.exists(`voice-model-${key}.bin`)

        voices.push({
          key,
          name: key.split('-').pop() || key,
          language: data.language?.code || 'unknown',
          quality: data.quality || 'medium',
          fileSize: '?',
          isDownloaded: isUrlInCache || isFileInOpfs
        })
      }
      return voices
    } catch (e) {
      return []
    }
  }

  return {
    isSupported,
    isLoaded,
    isLoading,
    isSpeaking,
    isPaused,
    init,
    speak,
    stop,
    togglePause,
    getVoices,
  }
}
