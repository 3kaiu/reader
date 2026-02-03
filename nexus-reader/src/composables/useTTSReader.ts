/**
 * TTS阅读器组合函数
 */
import { ref, computed, watch } from 'vue'
import { useTTS } from './useTTS'
import { useReaderStore } from '@/stores'

export function useTTSReader() {
  const { speak, pause, resume, stop, isSpeaking, availableVoices } = useTTS()
  const readerStore = useReaderStore()

  const currentChapter = computed(() => readerStore.currentChapter)
  const isReading = ref(false)
  const currentPosition = ref(0)
  const readingSpeed = ref(1.0)

  const startReading = () => {
    if (!currentChapter.value?.content) return

    isReading.value = true
    currentPosition.value = 0

    // 开始阅读当前章节
    readCurrentPosition()
  }

  const stopReading = () => {
    stop()
    isReading.value = false
  }

  const pauseReading = () => {
    pause()
    isReading.value = false
  }

  const resumeReading = () => {
    resume()
    isReading.value = true
  }

  const readCurrentPosition = () => {
    if (!currentChapter.value?.content || currentPosition.value >= currentChapter.value.content.length) {
      stopReading()
      return
    }

    // 获取下一段文本（大约200个字符）
    const text = currentChapter.value.content.substr(currentPosition.value, 200)
    const nextSpace = text.lastIndexOf(' ')
    const segment = nextSpace > 0 ? text.substr(0, nextSpace) : text

    speak(segment, {
      rate: readingSpeed.value,
      voice: availableVoices.value.find(v => v.lang.startsWith('zh')) || availableVoices.value[0]
    })

    currentPosition.value += segment.length
  }

  const setReadingSpeed = (speed: number) => {
    readingSpeed.value = Math.max(0.5, Math.min(2.0, speed))
  }

  const skipForward = (seconds: number = 10) => {
    // 估算跳过的字符数（基于语速）
    const charsToSkip = Math.floor(seconds * readingSpeed.value * 20)
    currentPosition.value = Math.min(
      currentPosition.value + charsToSkip,
      currentChapter.value?.content.length || 0
    )

    if (isReading.value) {
      readCurrentPosition()
    }
  }

  const skipBackward = (seconds: number = 10) => {
    const charsToSkip = Math.floor(seconds * readingSpeed.value * 20)
    currentPosition.value = Math.max(0, currentPosition.value - charsToSkip)

    if (isReading.value) {
      readCurrentPosition()
    }
  }

  // 监听TTS结束事件，继续阅读下一段
  watch(isSpeaking, (speaking) => {
    if (!speaking && isReading.value) {
      // 短暂延迟后继续阅读
      setTimeout(readCurrentPosition, 500)
    }
  })

  return {
    isReading: readonly(isReading),
    currentPosition: readonly(currentPosition),
    readingSpeed: readonly(readingSpeed),
    startReading,
    stopReading,
    pauseReading,
    resumeReading,
    setReadingSpeed,
    skipForward,
    skipBackward
  }
}