/**
 * 👁️ 护眼模式 Composable
 * 功能: 定时提醒休息 + 屏幕变暖
 */
import { ref, watch, onUnmounted } from 'vue'
import { useIntervalFn, useStorage } from '@vueuse/core'

export interface EyeCareConfig {
    enabled: boolean
    breakReminderEnabled: boolean
    breakIntervalMinutes: number // 每多少分钟提醒休息
    warmScreenEnabled: boolean
    warmScreenDelayMinutes: number // 阅读多久后开始变暖
    maxWarmLevel: number // 最大变暖程度 (0-50)
}

const defaultConfig: EyeCareConfig = {
    enabled: false,
    breakReminderEnabled: true,
    breakIntervalMinutes: 30,
    warmScreenEnabled: true,
    warmScreenDelayMinutes: 60,
    maxWarmLevel: 20,
}

export function useEyeCare() {
    // 持久化配置
    const config = useStorage<EyeCareConfig>('eye-care-config', defaultConfig)

    // 状态
    const readingMinutes = ref(0)
    const showBreakReminder = ref(false)
    const currentWarmLevel = ref(0)

    // 每分钟更新阅读时长
    const { pause, resume, isActive } = useIntervalFn(() => {
        if (!config.value.enabled) return

        readingMinutes.value++

        // 休息提醒
        if (
            config.value.breakReminderEnabled &&
            readingMinutes.value > 0 &&
            readingMinutes.value % config.value.breakIntervalMinutes === 0
        ) {
            showBreakReminder.value = true
            // 震动反馈 (如果支持)
            try {
                navigator.vibrate?.(200)
            } catch { }
        }

        // 屏幕变暖
        if (config.value.warmScreenEnabled) {
            if (readingMinutes.value >= config.value.warmScreenDelayMinutes) {
                // 逐渐增加暖色程度
                const minutesPast = readingMinutes.value - config.value.warmScreenDelayMinutes
                currentWarmLevel.value = Math.min(minutesPast, config.value.maxWarmLevel)
                applyWarmScreen(currentWarmLevel.value)
            }
        }
    }, 60000) // 每分钟检查

    // 应用屏幕变暖效果
    function applyWarmScreen(level: number) {
        const readerEl = document.querySelector('.reader-container') as HTMLElement
        if (readerEl) {
            if (level > 0) {
                readerEl.style.filter = `sepia(${level}%)`
            } else {
                readerEl.style.filter = ''
            }
        }
    }

    // 关闭休息提醒
    function dismissBreakReminder() {
        showBreakReminder.value = false
    }

    // 重置阅读时长 (用户休息后)
    function resetReadingTime() {
        readingMinutes.value = 0
        currentWarmLevel.value = 0
        applyWarmScreen(0)
        showBreakReminder.value = false
    }

    // 开启护眼模式
    function enable() {
        config.value.enabled = true
        resume()
    }

    // 关闭护眼模式
    function disable() {
        config.value.enabled = false
        resetReadingTime()
        pause()
    }

    // 更新配置
    function updateConfig(updates: Partial<EyeCareConfig>) {
        config.value = { ...config.value, ...updates }
    }

    // 格式化阅读时长显示
    function formatReadingTime(): string {
        const hours = Math.floor(readingMinutes.value / 60)
        const mins = readingMinutes.value % 60
        if (hours > 0) {
            return `${hours}小时${mins}分钟`
        }
        return `${mins}分钟`
    }

    // 组件卸载时清理
    onUnmounted(() => {
        applyWarmScreen(0)
    })

    // 监听配置变化
    watch(() => config.value.enabled, (enabled) => {
        if (enabled) {
            resume()
        } else {
            pause()
            resetReadingTime()
        }
    })

    return {
        // 配置
        config,

        // 状态
        readingMinutes,
        showBreakReminder,
        currentWarmLevel,
        isActive,

        // 方法
        enable,
        disable,
        resetReadingTime,
        dismissBreakReminder,
        updateConfig,
        formatReadingTime,

        // 暂停/恢复 (页面切换时使用)
        pause,
        resume,
    }
}

export type UseEyeCareReturn = ReturnType<typeof useEyeCare>
