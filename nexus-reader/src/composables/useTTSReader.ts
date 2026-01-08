/**
 * 🎙️ TTS Reader Composable
 * 从 reader.vue 提取的 TTS 朗读逻辑
 */
import { ref, watch, type Ref } from 'vue'
import { useTTS } from './useTTS'

// 依赖接口（避免循环依赖）
interface ReaderStoreLike {
    currentChapterIndex: number
}

interface SettingsStoreLike {
    config: {
        readingMode: 'scroll' | 'swipe'
    }
}

interface UseTTSReaderOptions {
    readerStore: ReaderStoreLike
    settingsStore: SettingsStoreLike
    swipeContentRef: Ref<HTMLElement | null>
    swipePage: Ref<number>
    swipeTotalPages: Ref<number>
    showTTSPanel: Ref<boolean>
    toast: { success: (msg: string) => void; warning: (msg: string) => void }
}

export function useTTSReader(options: UseTTSReaderOptions) {
    const {
        readerStore,
        settingsStore,
        swipeContentRef,
        swipePage,
        swipeTotalPages,
        showTTSPanel,
        toast,
    } = options

    const tts = useTTS()
    const currentParagraphIndex = ref(-1)

    // 获取页面上的所有段落元素
    function getParagraphs(): HTMLElement[] {
        return Array.from(
            document.querySelectorAll('.reader-text .content-paragraph')
        ) as HTMLElement[]
    }

    // 高亮当前段落并滚动
    function highlightCurrentParagraph() {
        const paragraphs = getParagraphs()
        paragraphs.forEach((p, idx) => {
            if (idx === currentParagraphIndex.value) {
                p.classList.add('tts-active')

                if (settingsStore.config.readingMode === 'swipe') {
                    // Swipe 模式：计算段落所在页并跳转
                    const container = swipeContentRef.value
                    if (container) {
                        const pageWidth = container.clientWidth
                        const pCenter = p.offsetLeft + p.clientWidth / 2
                        const targetPage = Math.floor(pCenter / pageWidth)

                        if (
                            targetPage >= 0 &&
                            targetPage < swipeTotalPages.value &&
                            targetPage !== swipePage.value
                        ) {
                            swipePage.value = targetPage
                        }
                    }
                } else {
                    // Scroll 模式：滚动到视图中心
                    p.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }
            } else {
                p.classList.remove('tts-active')
            }
        })
    }

    // 播放下一段
    function playNextParagraph() {
        if (!showTTSPanel.value) return

        const paragraphs = getParagraphs()
        if (paragraphs.length === 0) return

        if (currentParagraphIndex.value === -1) {
            if (settingsStore.config.readingMode === 'swipe') {
                const container = swipeContentRef.value
                if (container) {
                    const pageWidth = container.clientWidth
                    const currentScrollX = swipePage.value * pageWidth
                    const firstVisibleIndex = paragraphs.findIndex(
                        (p) => p.offsetLeft + p.clientWidth > currentScrollX
                    )
                    currentParagraphIndex.value =
                        firstVisibleIndex >= 0 ? firstVisibleIndex : 0
                } else {
                    currentParagraphIndex.value = 0
                }
            } else {
                const headerHeight = 60
                const firstVisibleIndex = paragraphs.findIndex((p) => {
                    const rect = p.getBoundingClientRect()
                    return rect.top >= headerHeight
                })
                currentParagraphIndex.value =
                    firstVisibleIndex >= 0 ? firstVisibleIndex : 0
            }
        } else {
            currentParagraphIndex.value++
        }

        if (currentParagraphIndex.value >= paragraphs.length) {
            stop()
            toast.success('本章朗读结束')
            return
        }

        const p = paragraphs[currentParagraphIndex.value]
        const text = p.textContent || p.innerText

        if (!text.trim()) {
            playNextParagraph()
            return
        }

        highlightCurrentParagraph()
        tts.speak(text, () => playNextParagraph())
        showTTSPanel.value = true
    }

    // 开始朗读
    function start() {
        if (!tts.isSupported.value) {
            toast.warning('您的浏览器不支持语音朗读')
            return
        }

        showTTSPanel.value = true

        if (currentParagraphIndex.value === -1) {
            playNextParagraph()
        } else {
            const paragraphs = getParagraphs()
            if (currentParagraphIndex.value < paragraphs.length) {
                const p = paragraphs[currentParagraphIndex.value]
                const text = p.textContent || p.innerText
                highlightCurrentParagraph()
                tts.speak(text, () => playNextParagraph())
            } else {
                currentParagraphIndex.value = -1
                playNextParagraph()
            }
        }
    }

    // 切换播放/暂停
    function toggle() {
        if (tts.isSpeaking.value) {
            tts.pause()
        } else if (tts.isPaused.value) {
            tts.resume()
        } else {
            start()
        }
    }

    // 停止朗读
    function stop() {
        tts.stop()
        showTTSPanel.value = false
        const paragraphs = getParagraphs()
        paragraphs.forEach((p) => p.classList.remove('tts-active'))
    }

    // 监听章节切换，重置 TTS
    watch(
        () => readerStore.currentChapterIndex,
        () => {
            if (showTTSPanel.value) {
                stop()
            }
            currentParagraphIndex.value = -1
        }
    )

    // ====== 睡眠定时器 ======
    const sleepTimerMinutes = ref(0) // 0 = 不限时
    const sleepTimerRemaining = ref(0) // 剩余秒数
    let sleepTimerInterval: ReturnType<typeof setInterval> | null = null

    // 设置睡眠定时器
    function setSleepTimer(minutes: number) {
        cancelSleepTimer()

        if (minutes <= 0) return

        sleepTimerMinutes.value = minutes
        sleepTimerRemaining.value = minutes * 60

        sleepTimerInterval = setInterval(() => {
            sleepTimerRemaining.value--

            if (sleepTimerRemaining.value <= 0) {
                stop()
                cancelSleepTimer()
                toast.success('定时结束，已停止朗读')
            }
        }, 1000)
    }

    // 取消睡眠定时器
    function cancelSleepTimer() {
        if (sleepTimerInterval) {
            clearInterval(sleepTimerInterval)
            sleepTimerInterval = null
        }
        sleepTimerMinutes.value = 0
        sleepTimerRemaining.value = 0
    }

    // 格式化剩余时间
    function formatSleepTimerRemaining(): string {
        const mins = Math.floor(sleepTimerRemaining.value / 60)
        const secs = sleepTimerRemaining.value % 60
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    return {
        // 状态
        currentParagraphIndex,
        isSpeaking: tts.isSpeaking,
        isPaused: tts.isPaused,
        isSupported: tts.isSupported,

        // 睡眠定时器状态
        sleepTimerMinutes,
        sleepTimerRemaining,

        // 方法
        start,
        stop,
        toggle,
        highlightCurrentParagraph,

        // 睡眠定时器方法
        setSleepTimer,
        cancelSleepTimer,
        formatSleepTimerRemaining,
    }
}

// 类型导出
export type UseTTSReaderReturn = ReturnType<typeof useTTSReader>

