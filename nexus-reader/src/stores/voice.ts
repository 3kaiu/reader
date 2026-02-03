/**
 * 语音功能状态管理
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, errorHandler, logger } from '@/utils/unified-utils'

interface VoiceSettings {
  rate: number
  pitch: number
  volume: number
  voice: string
  autoPlay: boolean
  language: string
}

interface TTSState {
  isPlaying: boolean
  currentText: string
  progress: number
  queue: string[]
  settings: VoiceSettings
}

export const useVoiceStore = defineStore('voice', () => {
  const state = ref<TTSState>({
    isPlaying: false,
    currentText: '',
    progress: 0,
    queue: [],
    settings: {
      rate: 1.0,
      pitch: 1.0,
      volume: 1.0,
      voice: 'default',
      autoPlay: false,
      language: 'zh-CN'
    }
  })

  const isPlaying = computed(() => state.value.isPlaying)
  const currentProgress = computed(() => state.value.progress)
  const hasQueue = computed(() => state.value.queue.length > 0)

  const updateSettings = async (newSettings: Partial<VoiceSettings>) => {
    try {
      state.value.settings = { ...state.value.settings, ...newSettings }
      logger.info('Voice settings updated', { settings: state.value.settings })
    } catch (error) {
      errorHandler.handle(error, { component: 'voice-store', operation: 'updateSettings' })
    }
  }

  const playText = async (text: string) => {
    try {
      if (state.value.isPlaying) {
        state.value.queue.push(text)
        return
      }

      state.value.currentText = text
      state.value.isPlaying = true
      state.value.progress = 0

      // 这里应该调用TTS服务
      logger.info('Playing text', { text: text.substring(0, 50) + '...' })

      // 模拟播放进度
      const interval = setInterval(() => {
        state.value.progress += 10
        if (state.value.progress >= 100) {
          clearInterval(interval)
          state.value.isPlaying = false
          state.value.progress = 0
          checkQueue()
        }
      }, 500)

    } catch (error) {
      errorHandler.handle(error, { component: 'voice-store', operation: 'playText' })
      state.value.isPlaying = false
    }
  }

  const pause = () => {
    state.value.isPlaying = false
    logger.info('TTS playback paused')
  }

  const resume = () => {
    if (state.value.currentText && !state.value.isPlaying) {
      state.value.isPlaying = true
      logger.info('TTS playback resumed')
    }
  }

  const stop = () => {
    state.value.isPlaying = false
    state.value.progress = 0
    state.value.queue = []
    logger.info('TTS playback stopped')
  }

  const checkQueue = () => {
    if (state.value.queue.length > 0) {
      const nextText = state.value.queue.shift()
      if (nextText) {
        playText(nextText)
      }
    }
  }

  const addToQueue = (text: string) => {
    state.value.queue.push(text)
    logger.info('Text added to TTS queue', { queueLength: state.value.queue.length })
  }

  const clearQueue = () => {
    state.value.queue = []
    logger.info('TTS queue cleared')
  }

  return {
    // State
    state: readonly(state),

    // Getters
    isPlaying,
    currentProgress,
    hasQueue,

    // Actions
    updateSettings,
    playText,
    pause,
    resume,
    stop,
    addToQueue,
    clearQueue
  }
})