import { ref, computed, onUnmounted, watch } from 'vue'

/**
 * TTS 语音朗读组合式函数
 * 使用 Web Speech API 实现文本朗读
 */
export function useTTS() {
    // 状态
    const isSupported = ref('speechSynthesis' in window)
    const isSpeaking = ref(false)
    const isPaused = ref(false)
    const currentText = ref('')
    const progress = ref(0) // 0-100

    // 语音设置
    const rate = ref(1) // 语速 0.5-2
    const pitch = ref(1) // 音调 0.5-2
    const volume = ref(1) // 音量 0-1
    const selectedVoice = ref<SpeechSynthesisVoice | null>(null)

    // 可用的语音列表
    const voices = ref<SpeechSynthesisVoice[]>([])

    // 中文语音
    const chineseVoices = computed(() =>
        voices.value.filter(v => v.lang.includes('zh') || v.lang.includes('CN'))
    )

    // 当前使用的 utterance
    let utterance: SpeechSynthesisUtterance | null = null

    // 加载语音列表
    function loadVoices() {
        if (!isSupported.value) return

        const loadedVoices = window.speechSynthesis.getVoices()
        voices.value = loadedVoices

        // 自动选择中文语音
        if (!selectedVoice.value && loadedVoices.length > 0) {
            const zhVoice = loadedVoices.find(v => v.lang.includes('zh') || v.lang.includes('CN'))
            selectedVoice.value = zhVoice || loadedVoices[0]
        }
    }

    // 初始化
    if (isSupported.value) {
        loadVoices()
        // Chrome 需要异步加载语音
        window.speechSynthesis.onvoiceschanged = loadVoices
    }

    // 监听设置变化，如果正在朗读则应用新设置
    watch([rate, pitch, volume], () => {
        if (isSpeaking.value && !isPaused.value) {
            // 重启朗读当前文本
            const text = currentText.value
            const callback = onEndCallback
            stop()
            // 微小延迟确保状态重置
            setTimeout(() => speak(text, callback), 50)
        }
    })

    // 朗读结束回调
    let onEndCallback: (() => void) | undefined

    // 开始朗读
    function speak(text: string, onEnd?: () => void) {
        if (!isSupported.value || !text) return

        // 停止当前朗读
        window.speechSynthesis.cancel()

        currentText.value = text
        onEndCallback = onEnd
        utterance = new SpeechSynthesisUtterance(text)

        // 设置参数
        utterance.rate = rate.value
        utterance.pitch = pitch.value
        utterance.volume = volume.value
        if (selectedVoice.value) {
            utterance.voice = selectedVoice.value
        }

        // 事件处理
        utterance.onstart = () => {
            isSpeaking.value = true
            isPaused.value = false
        }

        utterance.onend = () => {
            isSpeaking.value = false
            isPaused.value = false
            progress.value = 100
            if (onEndCallback) onEndCallback()
        }

        utterance.onerror = (e) => {
            console.error('TTS Error:', e)
            isSpeaking.value = false
            isPaused.value = false
        }

        // 进度更新 (使用 boundary 事件)
        utterance.onboundary = (e) => {
            if (e.charIndex && text.length > 0) {
                progress.value = Math.round((e.charIndex / text.length) * 100)
            }
        }

        window.speechSynthesis.speak(utterance)
    }

    // 暂停
    function pause() {
        if (!isSupported.value || !isSpeaking.value) return
        window.speechSynthesis.pause()
        isPaused.value = true
    }

    // 继续
    function resume() {
        if (!isSupported.value || !isPaused.value) return
        window.speechSynthesis.resume()
        isPaused.value = false
    }

    // 停止
    function stop() {
        if (!isSupported.value) return
        window.speechSynthesis.cancel()
        isSpeaking.value = false
        isPaused.value = false
        progress.value = 0
        utterance = null
        onEndCallback = undefined
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
    function setRate(newRate: number) {
        rate.value = Math.max(0.5, Math.min(2, newRate))
    }

    // 设置音调
    function setPitch(newPitch: number) {
        pitch.value = Math.max(0.5, Math.min(2, newPitch))
    }

    // 设置音量
    function setVolume(newVolume: number) {
        volume.value = Math.max(0, Math.min(1, newVolume))
    }

    // 选择语音
    function setVoice(voice: SpeechSynthesisVoice) {
        selectedVoice.value = voice
    }

    // 清理
    onUnmounted(() => {
        stop()
    })

    return {
        // 状态
        isSupported,
        isSpeaking,
        isPaused,
        progress,
        currentText,
        // 设置
        rate,
        pitch,
        volume,
        voices,
        chineseVoices,
        selectedVoice,
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
    }
}
