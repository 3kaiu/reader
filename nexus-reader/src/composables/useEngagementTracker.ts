import { onMounted, onUnmounted, ref, watch, nextTick } from 'vue'
import { useStatisticsStore } from '@/stores/statistics'

export function useEngagementTracker(bookId: string | undefined, chapterIndex: number) {
  const statsStore = useStatisticsStore()
  const observers = new Map<HTMLElement, IntersectionObserver>()
  const startTimes = new Map<number, number>()
  const observedElements = new Set<HTMLElement>()

  function startTracking(container: HTMLElement) {
    if (!bookId || !container) return

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const el = entry.target as HTMLElement
        const chunkIdx = parseInt(el.dataset.chunkIndex || '0')

        if (entry.isIntersecting) {
          startTimes.set(chunkIdx, Date.now())
        } else {
          const startTime = startTimes.get(chunkIdx)
          if (startTime) {
            const duration = Math.round((Date.now() - startTime) / 1000)
            if (duration > 0 && duration < 300) {
              statsStore.addEngagement(bookId, chapterIndex, chunkIdx, duration)
            }
            startTimes.delete(chunkIdx)
          }
        }
      })
    }, { threshold: 0.5 })

    const updateObservation = () => {
      const chunks = container.querySelectorAll('.content-paragraph')
      chunks.forEach((chunk, index) => {
        const el = chunk as HTMLElement
        if (!observedElements.has(el)) {
          el.dataset.chunkIndex = index.toString()
          observer.observe(el)
          observedElements.add(el)
        }
      })
    }

    updateObservation()
    observers.set(container, observer)

    // 返回刷新函数，供内容更新时调用
    return updateObservation
  }

  function stopTracking(container: HTMLElement) {
    const observer = observers.get(container)
    if (observer) {
      observer.disconnect()
      observers.delete(container)
      observedElements.clear()
    }
  }

  return {
    startTracking,
    stopTracking
  }
}
