import { onUnmounted, readonly, ref, watch } from 'vue'

type EyeCareConfig = {
  enabled: boolean
  reminderInterval: number
  restDuration: number
  nightMode: boolean
  blueLightFilter: boolean
}

export function useEyeCare() {
  const config = ref<EyeCareConfig>({
    enabled: false,
    reminderInterval: 30,
    restDuration: 5,
    nightMode: false,
    blueLightFilter: true,
  })
  const startedAt = ref<number | null>(null)
  const showBreakReminder = ref(false)
  let timer: ReturnType<typeof setInterval> | null = null

  const applyEyeCareStyling = () => {
    if (typeof document === 'undefined') {
      return
    }

    document.body.classList.toggle('eye-care-mode', config.value.enabled)
    document.body.classList.toggle('night-mode', config.value.enabled && config.value.nightMode)
    document.body.classList.toggle(
      'blue-light-filter',
      config.value.enabled && config.value.blueLightFilter
    )
  }

  const getReadingDurationMs = () => {
    if (!startedAt.value) {
      return 0
    }
    return Math.max(0, Date.now() - startedAt.value)
  }

  const formatReadingTime = () => {
    const totalMinutes = Math.max(1, Math.floor(getReadingDurationMs() / 60000))
    if (totalMinutes < 60) {
      return `${totalMinutes} 分钟`
    }

    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return minutes > 0 ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`
  }

  const dismissBreakReminder = () => {
    showBreakReminder.value = false
    startedAt.value = Date.now()
  }

  const stopTimer = () => {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  const checkReminder = () => {
    if (!config.value.enabled || !startedAt.value) {
      return
    }

    const elapsedMinutes = getReadingDurationMs() / 60000
    if (elapsedMinutes >= config.value.reminderInterval) {
      showBreakReminder.value = true
    }
  }

  const startTimer = () => {
    stopTimer()
    timer = setInterval(checkReminder, 60_000)
  }

  const enable = () => {
    config.value.enabled = true
    startedAt.value = Date.now()
    showBreakReminder.value = false
    startTimer()
    applyEyeCareStyling()
  }

  const disable = () => {
    config.value.enabled = false
    showBreakReminder.value = false
    startedAt.value = null
    stopTimer()
    applyEyeCareStyling()
  }

  watch(
    () => config.value.enabled,
    () => {
      applyEyeCareStyling()
    }
  )

  onUnmounted(() => {
    stopTimer()
  })

  return {
    config: readonly(config),
    showBreakReminder: readonly(showBreakReminder),
    enable,
    disable,
    dismissBreakReminder,
    formatReadingTime,
  }
}
