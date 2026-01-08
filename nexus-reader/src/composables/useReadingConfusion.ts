/**
 * 阅读困惑感知
 * 检测用户在段落停留过久，主动提示 AI 帮助
 */
import { ref, onUnmounted } from 'vue'
import { useStorage } from '@vueuse/core'

export interface ConfusionEvent {
    paragraphIndex: number
    paragraphText: string
    dwellTime: number
}

export interface UseReadingConfusionOptions {
    /** 触发阈值（秒），默认 45 秒 */
    threshold?: number
    /** 触发回调 */
    onConfusion: (event: ConfusionEvent) => void
    /** 功能开关 */
    enabled?: boolean
}

export function useReadingConfusion(options: UseReadingConfusionOptions) {
    const threshold = options.threshold || 45
    const currentParagraph = ref<number | null>(null)
    const currentParagraphText = ref('')
    const startTime = ref<number>(0)
    const dwellTimeSeconds = ref(0)

    // 用户可以在设置中关闭此功能
    const isEnabled = useStorage('reader-confusion-detection', true)

    let timer: ReturnType<typeof setTimeout> | null = null
    let trackingInterval: ReturnType<typeof setInterval> | null = null

    // 最近触发记录，避免对同一段落反复提示
    const recentlyTriggered = new Set<number>()

    /**
     * 开始追踪一个段落
     */
    function trackParagraph(index: number, text: string) {
        // 功能关闭时不追踪
        if (!isEnabled.value || options.enabled === false) return

        // 同一段落不重复追踪
        if (currentParagraph.value === index) return

        // 清除之前的计时
        clearTimers()

        // 如果该段落最近已触发过，跳过
        if (recentlyTriggered.has(index)) return

        currentParagraph.value = index
        currentParagraphText.value = text
        startTime.value = Date.now()
        dwellTimeSeconds.value = 0

        // 实时更新停留时间
        trackingInterval = setInterval(() => {
            dwellTimeSeconds.value = Math.round((Date.now() - startTime.value) / 1000)
        }, 1000)

        // 设置触发计时器
        timer = setTimeout(() => {
            const dwellTime = Math.round((Date.now() - startTime.value) / 1000)

            // 标记为已触发，避免重复
            recentlyTriggered.add(index)

            // 5分钟后允许重新触发
            setTimeout(() => recentlyTriggered.delete(index), 5 * 60 * 1000)

            options.onConfusion({
                paragraphIndex: index,
                paragraphText: text.slice(0, 300), // 截取前300字符
                dwellTime,
            })
        }, threshold * 1000)
    }

    /**
     * 用户主动交互后重置计时
     */
    function resetTimer() {
        if (currentParagraph.value !== null) {
            startTime.value = Date.now()
            dwellTimeSeconds.value = 0

            // 重置触发计时器
            if (timer) {
                clearTimeout(timer)
                timer = setTimeout(() => {
                    const dwellTime = Math.round((Date.now() - startTime.value) / 1000)
                    const idx = currentParagraph.value
                    if (idx !== null && !recentlyTriggered.has(idx)) {
                        recentlyTriggered.add(idx)
                        setTimeout(() => recentlyTriggered.delete(idx), 5 * 60 * 1000)

                        options.onConfusion({
                            paragraphIndex: idx,
                            paragraphText: currentParagraphText.value.slice(0, 300),
                            dwellTime,
                        })
                    }
                }, threshold * 1000)
            }
        }
    }

    /**
     * 完全停止追踪
     */
    function stopTracking() {
        clearTimers()
        currentParagraph.value = null
        currentParagraphText.value = ''
        startTime.value = 0
        dwellTimeSeconds.value = 0
    }

    /**
     * 清除定时器
     */
    function clearTimers() {
        if (timer) {
            clearTimeout(timer)
            timer = null
        }
        if (trackingInterval) {
            clearInterval(trackingInterval)
            trackingInterval = null
        }
    }

    /**
     * 切换功能开关
     */
    function toggle() {
        isEnabled.value = !isEnabled.value
        if (!isEnabled.value) {
            stopTracking()
        }
    }

    // 组件卸载时清理
    onUnmounted(() => {
        clearTimers()
    })

    return {
        /** 当前追踪的段落索引 */
        currentParagraph,
        /** 当前段落停留时间（秒） */
        dwellTimeSeconds,
        /** 功能是否启用 */
        isEnabled,
        /** 开始追踪段落 */
        trackParagraph,
        /** 重置计时（用户有交互时调用） */
        resetTimer,
        /** 停止追踪 */
        stopTracking,
        /** 切换功能开关 */
        toggle,
    }
}
