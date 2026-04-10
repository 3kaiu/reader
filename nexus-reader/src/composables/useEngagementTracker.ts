import { ref } from 'vue'

export function useEngagementTracker(_bookUrl?: string, _chapterIndex?: number) {
  const started = ref(false)
  const startedAt = ref<number | null>(null)

  const startTracking = (_container?: Element | null) => {
    started.value = true
    startedAt.value = Date.now()
  }

  const stopTracking = (_container?: Element | null) => {
    started.value = false
    startedAt.value = null
  }

  return {
    startTracking,
    stopTracking,
  }
}
