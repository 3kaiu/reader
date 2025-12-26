/**
 * 自定义音色 TTS 组合函数
 * 支持端侧 TTS 引擎和自定义音色
 */
import { ref, computed, onUnmounted, watch } from 'vue'
import { useVoiceStore } from '@/stores/voice'
import type { TTSConfig, TTSEngine } from '@/types/voice'
import { logger } from '@/utils/logger'

// TODO: 集成实际的 TTS 引擎（如 Piper TTS）
// import { PiperTTS } from '@piper-tts/core'

export function useCustomTTS() {
  const voiceStore = useVoiceStore()

  // 状态
  const isSupported = ref(false)
  const isSpeaking = ref(false)
  const isPaused = ref(false)
  const currentText = ref('')
  const progress = ref(0) // 0-100

  // 配置
  const config = ref<TTSConfig>({
    engine: 'web-speech', // 默认使用 Web Speech API
    rate: 1,
    pitch: 1,
    volume: 1,
  })

  // TTS 引擎状态
  const isEngineLoaded = ref(false)
  const isEngineLoading = ref(false)

  // 音频上下文（Web Audio API）
  let audioContext: AudioContext | null = null
  let currentAudioSource: AudioBufferSourceNode | null = null

  // 初始化
  async function init() {
    // 检查 Web Audio API 支持
    if (typeof AudioContext !== 'undefined' || typeof (window as any).webkitAudioContext !== 'undefined') {
      try {
        audioContext = new (AudioContext || (window as any).webkitAudioContext)()
        isSupported.value = true
      } catch (e) {
        logger.error('Web Audio API 初始化失败', e as Error)
        isSupported.value = false
      }
    } else {
      isSupported.value = false
    }

    // 从 LocalStorage 加载配置
    loadConfig()
  }

  // 加载配置
  function loadConfig() {
    try {
      const saved = localStorage.getItem('tts-config')
      if (saved) {
        const parsed = JSON.parse(saved) as TTSConfig
        config.value = { ...config.value, ...parsed }
      }
    } catch (e) {
      logger.error('加载 TTS 配置失败', e as Error)
    }
  }

  // 保存配置
  function saveConfig() {
    try {
      localStorage.setItem('tts-config', JSON.stringify(config.value))
    } catch (e) {
      logger.error('保存 TTS 配置失败', e as Error)
    }
  }

  // 设置引擎类型
  async function setEngine(engine: TTSEngine) {
    if (config.value.engine === engine) return

    // 如果正在播放，先停止
    if (isSpeaking.value) {
      stop()
    }

    config.value.engine = engine
    saveConfig()

    // 如果切换到自定义引擎，需要加载
    if (engine === 'custom' && !isEngineLoaded.value) {
      await loadCustomEngine()
    }
  }

  // 加载自定义 TTS 引擎
  async function loadCustomEngine() {
    if (isEngineLoading.value || isEngineLoaded.value) return

    isEngineLoading.value = true

    try {
      // TODO: 实际加载 TTS 引擎
      // 这里需要根据选择的 TTS 库来实现
      // 例如：
      // const engine = await PiperTTS.load()
      // await engine.initialize()

      // 临时模拟
      await new Promise(resolve => setTimeout(resolve, 1000))

      isEngineLoaded.value = true
    } catch (e) {
      logger.error('加载 TTS 引擎失败', e as Error)
      // 回退到 Web Speech API
      config.value.engine = 'web-speech'
      saveConfig()
    } finally {
      isEngineLoading.value = false
    }
  }

  // 使用自定义音色生成音频
  async function generateAudioWithCustomVoice(text: string, voiceId: string): Promise<AudioBuffer | null> {
    try {
      // 获取音色模型
      const modelData = await voiceStore.getVoiceModel(voiceId)
      if (!modelData) {
        throw new Error('音色模型不存在')
      }

      // TODO: 实际调用 TTS 引擎生成音频
      // 这里需要根据选择的 TTS 库来实现
      // 例如：
      // const engine = getTTSEngine()
      // const audioData = await engine.synthesize(text, modelData)
      // return audioData

      // 临时返回 null，实际实现时应该返回 AudioBuffer
      logger.warn('自定义 TTS 引擎未实现', { text, voiceId })
      return null
    } catch (e) {
      logger.error('生成音频失败', e as Error, { voiceId })
      return null
    }
  }

  // 播放音频
  async function playAudio(audioBuffer: AudioBuffer, onEnd?: () => void) {
    if (!audioContext) {
      logger.error('AudioContext 未初始化')
      return
    }

    // 停止当前播放
    if (currentAudioSource) {
      currentAudioSource.stop()
      currentAudioSource = null
    }

    try {
      // 创建音频源
      const source = audioContext.createBufferSource()
      source.buffer = audioBuffer

      // 创建音量控制器
      const gainNode = audioContext.createGain()
      gainNode.gain.value = config.value.volume

      // 连接节点
      source.connect(gainNode)
      gainNode.connect(audioContext.destination)

      // 设置播放速度
      source.playbackRate.value = config.value.rate

      // 监听播放结束
      source.onended = () => {
        isSpeaking.value = false
        isPaused.value = false
        progress.value = 100
        if (onEnd) onEnd()
      }

      // 开始播放
      source.start(0)
      currentAudioSource = source
      isSpeaking.value = true
      isPaused.value = false

      // TODO: 实现进度追踪
      // 可以通过 AudioContext.currentTime 和 audioBuffer.duration 来计算

    } catch (e) {
      logger.error('播放音频失败', e as Error)
      isSpeaking.value = false
    }
  }

  // 开始朗读
  async function speak(text: string, onEnd?: () => void) {
    if (!text) return
    
    // 保存回调
    onEndCallback = onEnd

    // 根据引擎类型选择实现
    if (config.value.engine === 'custom' && config.value.voiceId) {
      // 使用自定义音色
      if (!isSupported.value) {
        logger.error('浏览器不支持 Web Audio API')
        return
      }

      if (!isEngineLoaded.value) {
        await loadCustomEngine()
        if (!isEngineLoaded.value) {
          logger.error('TTS 引擎加载失败，回退到 Web Speech API')
          config.value.engine = 'web-speech'
          saveConfig()
        }
      }

      const audioBuffer = await generateAudioWithCustomVoice(text, config.value.voiceId)
      if (audioBuffer) {
        await playAudio(audioBuffer, onEnd)
      } else {
        // 如果生成失败，回退到 Web Speech API
        logger.warn('自定义音色生成失败，回退到 Web Speech API')
        await speakWithWebSpeech(text, onEnd)
      }
    } else {
      // 使用 Web Speech API（传统模式）
      await speakWithWebSpeech(text, onEnd)
    }
  }

  // 使用 Web Speech API 朗读（兼容模式）
  async function speakWithWebSpeech(text: string, onEnd?: () => void) {
    if (!('speechSynthesis' in window)) {
      logger.error('浏览器不支持 Web Speech API')
      return
    }

    currentText.value = text

    // 停止当前朗读
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = config.value.rate
    utterance.pitch = config.value.pitch
    utterance.volume = config.value.volume

    // 如果使用默认音色，可以选择
    if (config.value.engine === 'web-speech' && voiceStore.defaultVoice.value) {
      // Web Speech API 无法直接使用自定义音色
      // 这里可以选择一个相似的系统语音
      const voices = window.speechSynthesis.getVoices()
      const similarVoice = voices.find(v => v.lang.includes('zh'))
      if (similarVoice) {
        utterance.voice = similarVoice
      }
    }

    utterance.onstart = () => {
      isSpeaking.value = true
      isPaused.value = false
    }

    utterance.onend = () => {
      isSpeaking.value = false
      isPaused.value = false
      progress.value = 100
      onEndCallback = undefined
      if (onEnd) onEnd()
    }

    utterance.onerror = (e) => {
      logger.error('TTS 错误', e as Error)
      isSpeaking.value = false
      isPaused.value = false
    }

    // 进度更新
    utterance.onboundary = (e) => {
      if (e.charIndex && text.length > 0) {
        progress.value = Math.round((e.charIndex / text.length) * 100)
      }
    }

    window.speechSynthesis.speak(utterance)
  }

  // 暂停
  function pause() {
    if (config.value.engine === 'custom') {
      // 暂停 Web Audio API 播放
      if (audioContext && currentAudioSource) {
        audioContext.suspend()
        isPaused.value = true
      }
    } else {
      // 暂停 Web Speech API
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.pause()
        isPaused.value = true
      }
    }
  }

  // 继续
  function resume() {
    if (config.value.engine === 'custom') {
      // 恢复 Web Audio API 播放
      if (audioContext && isPaused.value) {
        audioContext.resume()
        isPaused.value = false
      }
    } else {
      // 恢复 Web Speech API
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume()
        isPaused.value = false
      }
    }
  }

  // 停止
  function stop() {
    if (config.value.engine === 'custom') {
      // 停止 Web Audio API 播放
      if (currentAudioSource) {
        currentAudioSource.stop()
        currentAudioSource = null
      }
      if (audioContext) {
        audioContext.suspend()
      }
    } else {
      // 停止 Web Speech API
      window.speechSynthesis.cancel()
    }

    isSpeaking.value = false
    isPaused.value = false
    progress.value = 0
  }

  // 切换播放/暂停
  function toggle() {
    if (isPaused.value) {
      resume()
    } else if (isSpeaking.value) {
      pause()
    }
  }

  // 设置语速
  function setRate(rate: number) {
    config.value.rate = Math.max(0.5, Math.min(2, rate))
    saveConfig()
  }

  // 设置音调
  function setPitch(pitch: number) {
    config.value.pitch = Math.max(0.5, Math.min(2, pitch))
    saveConfig()
  }

  // 设置音量
  function setVolume(volume: number) {
    config.value.volume = Math.max(0, Math.min(1, volume))
    saveConfig()
  }

  // 设置音色
  async function setVoice(voiceId: string | null) {
    config.value.voiceId = voiceId || undefined
    saveConfig()

    // 如果设置了音色，切换到自定义引擎
    if (voiceId) {
      await setEngine('custom')
    }
  }

  // 监听配置变化，实时应用
  watch([() => config.value.rate, () => config.value.pitch, () => config.value.volume], () => {
    if (isSpeaking.value && !isPaused.value) {
      // 重新开始朗读以应用新设置
      const text = currentText.value
      const callback = onEndCallback
      stop()
      setTimeout(() => speak(text, callback), 50)
    }
  })

  // 初始化
  init()

  // 清理
  onUnmounted(() => {
    stop()
    if (audioContext) {
      audioContext.close()
    }
  })

  return {
    // 状态
    isSupported,
    isSpeaking,
    isPaused,
    progress,
    currentText,
    config,
    isEngineLoaded,
    isEngineLoading,
    // 方法
    speak,
    pause,
    resume,
    stop,
    toggle,
    setRate,
    setPitch,
    setVolume,
    setVoice,
    setEngine,
    loadCustomEngine,
  }
}
