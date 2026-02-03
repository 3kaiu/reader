/**
 * 文本转语音组合函数
 */
import { ref, computed } from 'vue'
import { useVoiceStore } from '@/stores'

export function useTTS() {
  const voiceStore = useVoiceStore()

  const isSupported = ref('speechSynthesis' in window)
  const isSpeaking = computed(() => voiceStore.isPlaying)
  const availableVoices = ref<SpeechSynthesisVoice[]>([])

  const initialize = () => {
    if (!isSupported.value) return

    // 获取可用语音
    const updateVoices = () => {
      availableVoices.value = speechSynthesis.getVoices()
    }

    updateVoices()
    speechSynthesis.onvoiceschanged = updateVoices
  }

  const speak = (text: string, options: {
    voice?: SpeechSynthesisVoice
    rate?: number
    pitch?: number
    volume?: number
  } = {}) => {
    if (!isSupported.value || !text.trim()) return

    // 停止当前播放
    stop()

    const utterance = new SpeechSynthesisUtterance(text)

    // 应用设置
    if (options.voice) utterance.voice = options.voice
    utterance.rate = options.rate || voiceStore.state.settings.rate
    utterance.pitch = options.pitch || voiceStore.state.settings.pitch
    utterance.volume = options.volume || voiceStore.state.settings.volume

    utterance.onstart = () => {
      voiceStore.playText(text)
    }

    utterance.onend = () => {
      voiceStore.stop()
    }

    utterance.onerror = (error) => {
      console.error('TTS error:', error)
      voiceStore.stop()
    }

    speechSynthesis.speak(utterance)
  }

  const pause = () => {
    if (isSupported.value) {
      speechSynthesis.pause()
      voiceStore.pause()
    }
  }

  const resume = () => {
    if (isSupported.value) {
      speechSynthesis.resume()
      voiceStore.resume()
    }
  }

  const stop = () => {
    if (isSupported.value) {
      speechSynthesis.cancel()
      voiceStore.stop()
    }
  }

  const getVoiceByLanguage = (language: string): SpeechSynthesisVoice | undefined => {
    return availableVoices.value.find(voice =>
      voice.lang.startsWith(language) || voice.lang.includes(language)
    )
  }

  // 初始化
  initialize()

  return {
    isSupported: readonly(isSupported),
    isSpeaking,
    availableVoices: readonly(availableVoices),
    speak,
    pause,
    resume,
    stop,
    getVoiceByLanguage
  }
}