/**
 * 护眼模式组合函数
 */
import { ref, watch } from 'vue'
import { useSettingsStore } from '@/stores'

export function useEyeCare() {
  const settingsStore = useSettingsStore()
  const isEyeCareMode = ref(false)
  const eyeCareStartTime = ref<number | null>(null)
  const continuousReadingTime = ref(0)

  // 护眼模式设置
  const eyeCareSettings = ref({
    enabled: false,
    reminderInterval: 20 * 60 * 1000, // 20分钟
    breakDuration: 20 * 1000, // 20秒
    nightMode: false,
    blueLightFilter: true
  })

  const toggleEyeCareMode = () => {
    isEyeCareMode.value = !isEyeCareMode.value

    if (isEyeCareMode.value) {
      eyeCareStartTime.value = Date.now()
      startEyeCareTimer()
    } else {
      eyeCareStartTime.value = null
      stopEyeCareTimer()
    }
  }

  const startEyeCareTimer = () => {
    // 每分钟更新连续阅读时间
    const timer = setInterval(() => {
      if (eyeCareStartTime.value) {
        continuousReadingTime.value = Date.now() - eyeCareStartTime.value

        // 检查是否需要休息提醒
        if (continuousReadingTime.value >= eyeCareSettings.value.reminderInterval) {
          showBreakReminder()
        }
      }
    }, 60000)
  }

  const stopEyeCareTimer = () => {
    continuousReadingTime.value = 0
  }

  const showBreakReminder = () => {
    // 这里应该显示休息提醒UI
    console.log('Eye care: Time for a break!')

    // 自动暂停阅读
    // pauseReading()
  }

  const applyEyeCareStyling = () => {
    if (isEyeCareMode.value) {
      // 应用护眼样式
      document.body.classList.add('eye-care-mode')

      if (eyeCareSettings.value.nightMode) {
        document.body.classList.add('night-mode')
      }

      if (eyeCareSettings.value.blueLightFilter) {
        document.body.classList.add('blue-light-filter')
      }
    } else {
      // 移除护眼样式
      document.body.classList.remove('eye-care-mode', 'night-mode', 'blue-light-filter')
    }
  }

  // 监听护眼模式变化
  watch(isEyeCareMode, applyEyeCareStyling)

  return {
    isEyeCareMode: readonly(isEyeCareMode),
    continuousReadingTime: readonly(continuousReadingTime),
    eyeCareSettings: readonly(eyeCareSettings),
    toggleEyeCareMode,
    showBreakReminder
  }
}