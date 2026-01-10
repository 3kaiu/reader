import { ref, computed, onUnmounted, watch } from 'vue'
import { useSettingsStore } from '../stores/settings'
import { useVoiceStore } from '../stores/voice'
import { logger } from '../utils/logger'

/**
 * 🎙️ TTS Engine Router - 语音朗读路由
 * 整合系统 Web Speech API 与 高质量本地 Piper TTS (动态加载)
 */
export function useTTS() {
    const settings = useSettingsStore()
    const voiceStore = useVoiceStore()

    // --- 系统 TTS 原始状态 ---
    const sysSupported = ref('speechSynthesis' in window)
    const sysVoices = ref<SpeechSynthesisVoice[]>([])
    const selectedSysVoice = ref<SpeechSynthesisVoice | null>(null)
    let utterance: SpeechSynthesisUtterance | null = null

    // --- 路由状态 ---
    const isSpeaking = computed(() =>
        settings.config.ttsEngine === 'piper' ? voiceStore.isSpeaking.value : sysSpeaking.value
    )
    const isPaused = computed(() =>
        settings.config.ttsEngine === 'piper' ? voiceStore.isPaused.value : sysPaused.value
    )
    const isSupported = computed(() =>
        settings.config.ttsEngine === 'piper' ? voiceStore.isTTSSupported.value : sysSupported.value
    )
    const isLoading = computed(() =>
        settings.config.ttsEngine === 'piper' ? voiceStore.isTTSLoading.value : false
    )
    const loadProgress = computed(() =>
        settings.config.ttsEngine === 'piper' ? voiceStore.ttsLoadProgress.value : 0
    )
    const loadStatus = computed(() =>
        settings.config.ttsEngine === 'piper' ? voiceStore.ttsLoadStatus.value : ''
    )
    const error = computed(() =>
        settings.config.ttsEngine === 'piper' ? voiceStore.ttsError.value : null
    )

    const sysSpeaking = ref(false)
    const sysPaused = ref(false)
    const currentText = ref('')
    const progress = ref(0)

    // 共享设置接口
    const rate = computed({
        get: () => settings.config.ttsRate,
        set: (val) => settings.updateConfig('ttsRate', val)
    })

    // --- 系统 TTS 逻辑 ---
    function loadSysVoices() {
        if (!sysSupported.value) return
        const loaded = window.speechSynthesis.getVoices()
        sysVoices.value = loaded
        if (!selectedSysVoice.value && loaded.length > 0) {
            const zh = loaded.find(v => v.lang.includes('zh') || v.lang.includes('CN'))
            selectedSysVoice.value = zh || loaded[0]
        }
    }

    if (sysSupported.value) {
        loadSysVoices()
        window.speechSynthesis.onvoiceschanged = loadSysVoices
    }

    // --- 统一 API ---

    /**
     * 朗读文本
     */
    async function speak(text: string, onEnd?: () => void) {
        currentText.value = text

        if (settings.config.ttsEngine === 'piper') {
            const voiceId = settings.config.piperVoice || 'zh_CN-huayan-medium'
            await voiceStore.speak(text, voiceId)
            
            // 监听播放结束
            if (onEnd) {
                const checkEnd = setInterval(() => {
                    if (!voiceStore.isSpeaking.value) {
                        clearInterval(checkEnd)
                        onEnd()
                    }
                }, 100)
            }
        } else {
            // 系统 TTS
            window.speechSynthesis.cancel()
            utterance = new SpeechSynthesisUtterance(text)
            utterance.rate = rate.value
            if (selectedSysVoice.value) utterance.voice = selectedSysVoice.value

            utterance.onstart = () => { sysSpeaking.value = true; sysPaused.value = false }
            utterance.onend = () => { sysSpeaking.value = false; if (onEnd) onEnd() }
            utterance.onerror = () => { sysSpeaking.value = false }
            utterance.onboundary = (e) => {
                if (e.charIndex) progress.value = Math.round((e.charIndex / text.length) * 100)
            }

            window.speechSynthesis.speak(utterance)
        }
    }

    function stop() {
        if (settings.config.ttsEngine === 'piper') {
            voiceStore.stopSpeaking()
        } else {
            window.speechSynthesis.cancel()
            sysSpeaking.value = false
            sysPaused.value = false
        }
    }

    function toggle() {
        if (settings.config.ttsEngine === 'piper') {
            voiceStore.togglePause()
        } else {
            if (sysPaused.value) {
                window.speechSynthesis.resume()
                sysPaused.value = false
            } else {
                window.speechSynthesis.pause()
                sysPaused.value = true
            }
        }
    }

    function setRate(newRate: number) {
        rate.value = newRate
    }

    // 暴露给设置页面的方法
    const initTTS = () => voiceStore.initializeTTSService()
    const loadTTSEngine = () => voiceStore.loadTTSEngine()
    const getAvailableVoices = () => voiceStore.getAvailableVoices()
    const preloadTTSModel = (voiceId: string) => voiceStore.preloadTTSModel(voiceId)
    const getCachedTTSModels = () => voiceStore.getCachedTTSModels()

    return {
        isSupported,
        isSpeaking,
        isPaused,
        isLoading,
        loadProgress,
        loadStatus,
        error,
        progress,
        currentText,
        rate,
        voices: sysVoices,
        selectedVoice: selectedSysVoice,
        speak,
        stop,
        toggle,
        setRate,
        // TTS 服务管理
        initTTS,
        loadTTSEngine,
        getAvailableVoices,
        preloadTTSModel,
        getCachedTTSModels,
    }
}
