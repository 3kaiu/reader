import { nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useScroll, useThrottleFn } from '@vueuse/core'
import { logger } from '@/utils/logger'
import { useReaderStore } from '@/stores/reader'

export function useReaderScrollSync(options: {
  readerStore: ReturnType<typeof useReaderStore>
}) {
  const { arrivedState } = useScroll(window, { offset: { bottom: 200 } })
  const handleBeforeUnload = () => options.readerStore.saveProgress()

  const debouncedAppendNext = useThrottleFn(async () => {
    if (options.readerStore.hasNextChapter && !options.readerStore.isLoadingMore) {
      const success = await options.readerStore.appendNextChapter()
      if (!success) {
        logger.warn('自动加载下一章失败，显示重试选项', {
          loadError: options.readerStore.loadError,
        })
      }
    }
  }, 1000)

  const debouncedChapterSync = useThrottleFn(() => {
    options.readerStore.updateChapterIndexByScroll()
  }, 500)
  const chapterMarkerSelector = '.chapter-marker[data-chapter-index]'
  let chapterMarkerObserver: IntersectionObserver | null = null
  const visibleChapterMarkers = new Set<HTMLElement>()

  const syncChapterByVisibleMarkers = () => {
    if (visibleChapterMarkers.size === 0) {
      options.readerStore.updateChapterIndexByScroll()
      return
    }

    const targetLine = window.innerHeight * 0.35
    let resolvedIndex: number | null = null
    let minDistance = Number.POSITIVE_INFINITY

    visibleChapterMarkers.forEach(marker => {
      if (!marker.isConnected) {
        visibleChapterMarkers.delete(marker)
        return
      }

      const chapterIndex = Number(marker.dataset.chapterIndex)
      if (Number.isNaN(chapterIndex)) {
        return
      }

      const distance = Math.abs(marker.getBoundingClientRect().top - targetLine)
      if (distance < minDistance) {
        minDistance = distance
        resolvedIndex = chapterIndex
      }
    })

    if (resolvedIndex !== null) {
      options.readerStore.syncCurrentChapterByIndex(resolvedIndex)
      return
    }

    options.readerStore.updateChapterIndexByScroll()
  }

  const setupChapterMarkerObserver = () => {
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      return false
    }

    if (!chapterMarkerObserver) {
      chapterMarkerObserver = new IntersectionObserver(
        entries => {
          entries.forEach(entry => {
            const marker = entry.target as HTMLElement
            if (entry.isIntersecting) {
              visibleChapterMarkers.add(marker)
            } else {
              visibleChapterMarkers.delete(marker)
            }
          })
          syncChapterByVisibleMarkers()
        },
        {
          root: null,
          rootMargin: '-35% 0px -45% 0px',
          threshold: [0, 0.1, 0.5, 1],
        },
      )
    }

    visibleChapterMarkers.clear()
    const chapterMarkers = Array.from(
      document.querySelectorAll<HTMLElement>(chapterMarkerSelector),
    )
    chapterMarkers.forEach(marker => chapterMarkerObserver?.observe(marker))
    syncChapterByVisibleMarkers()
    return true
  }

  watch(
    () => arrivedState.bottom,
    (isBottom) => {
      if (isBottom) {
        if (!options.readerStore.loadError) {
          debouncedAppendNext()
        }
      }
    }
  )

  watch(
    () => {
      const chapters = options.readerStore.loadedChapters
      const firstIndex = chapters[0]?.index ?? -1
      const lastIndex = chapters[chapters.length - 1]?.index ?? -1
      return `${chapters.length}:${firstIndex}:${lastIndex}`
    },
    () => {
      void nextTick(() => {
        if (chapterMarkerObserver) {
          chapterMarkerObserver.disconnect()
          visibleChapterMarkers.clear()
        }
        setupChapterMarkerObserver()
      })
    },
    { flush: 'post' },
  )

  onMounted(() => {
    const observerEnabled = setupChapterMarkerObserver()
    if (!observerEnabled) {
      window.addEventListener('scroll', debouncedChapterSync, { passive: true })
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
  })

  onUnmounted(() => {
    if (chapterMarkerObserver) {
      chapterMarkerObserver.disconnect()
      chapterMarkerObserver = null
      visibleChapterMarkers.clear()
    }
    window.removeEventListener('scroll', debouncedChapterSync)
    window.removeEventListener('beforeunload', handleBeforeUnload)
  })
}
