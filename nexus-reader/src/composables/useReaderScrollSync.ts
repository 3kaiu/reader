import { nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useScroll, useThrottleFn } from '@vueuse/core'
import { logger } from '@/utils/logger'
import { useReaderStore } from '@/stores/reader'
import { useSettingsStore } from '@/stores/settings'

export function useReaderScrollSync(options: {
  readerStore: ReturnType<typeof useReaderStore>
  settingsStore: ReturnType<typeof useSettingsStore>
}) {
  const { arrivedState } = useScroll(window, { offset: { bottom: 200 } })
  const handleBeforeUnload = () => options.readerStore.saveProgress()

  const debouncedAppendNext = useThrottleFn(async () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return
    }

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
  let pendingChapterSyncRafId: number | null = null
  let performanceObservers: PerformanceObserver[] = []
  let previousDocumentScrollBehavior: string | null = null
  const performanceLogLastAt = new Map<string, number>()
  const PERFORMANCE_LOG_THROTTLE_MS = 3000

  const logPerformanceEvent = (
    kind: 'longtask' | 'layout-shift' | 'event',
    payload: Record<string, unknown>,
  ) => {
    const now = Date.now()
    const lastAt = performanceLogLastAt.get(kind) || 0
    if (now - lastAt < PERFORMANCE_LOG_THROTTLE_MS) {
      return
    }
    performanceLogLastAt.set(kind, now)
    logger.debug(`reader ${kind} detected`, payload)
  }

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

  const scheduleChapterSyncByVisibleMarkers = () => {
    if (pendingChapterSyncRafId !== null) {
      return
    }

    pendingChapterSyncRafId = window.requestAnimationFrame(() => {
      pendingChapterSyncRafId = null
      syncChapterByVisibleMarkers()
    })
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
          scheduleChapterSyncByVisibleMarkers()
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
    scheduleChapterSyncByVisibleMarkers()
    return true
  }

  const clearPerformanceObservers = () => {
    performanceObservers.forEach(observer => observer.disconnect())
    performanceObservers = []
  }

  const setupPerformanceObservers = () => {
    if (
      typeof window === 'undefined' ||
      typeof PerformanceObserver === 'undefined' ||
      options.settingsStore.config.performanceMode === 'compat'
    ) {
      return
    }

    const supportedEntryTypes = PerformanceObserver.supportedEntryTypes || []

    if (supportedEntryTypes.includes('longtask')) {
      const longTaskObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.duration >= 50) {
            logPerformanceEvent('longtask', {
              duration: Number(entry.duration.toFixed(1)),
              chapterIndex: options.readerStore.currentChapterIndex,
              loadedChapters: options.readerStore.loadedChapters.length,
            })
          }
        })
      })
      longTaskObserver.observe({ type: 'longtask', buffered: true })
      performanceObservers.push(longTaskObserver)
    }

    if (supportedEntryTypes.includes('layout-shift')) {
      const layoutShiftObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          const shiftEntry = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean }
          if (!shiftEntry.hadRecentInput && (shiftEntry.value || 0) > 0.04) {
            logPerformanceEvent('layout-shift', {
              value: Number((shiftEntry.value || 0).toFixed(4)),
              chapterIndex: options.readerStore.currentChapterIndex,
            })
          }
        })
      })
      layoutShiftObserver.observe({ type: 'layout-shift', buffered: true })
      performanceObservers.push(layoutShiftObserver)
    }

    if (supportedEntryTypes.includes('event')) {
      const eventObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.duration >= 120) {
            logPerformanceEvent('event', {
              name: entry.name,
              duration: Number(entry.duration.toFixed(1)),
              chapterIndex: options.readerStore.currentChapterIndex,
            })
          }
        })
      })
      eventObserver.observe({
        type: 'event',
        buffered: true,
      } as PerformanceObserverInit)
      performanceObservers.push(eventObserver)
    }
  }

  const applyReaderPerformanceEnvironment = () => {
    if (typeof document === 'undefined') {
      return
    }

    const mode = options.settingsStore.config.performanceMode
    const root = document.documentElement
    root.dataset.readerPerformanceMode = mode
    if (previousDocumentScrollBehavior === null) {
      previousDocumentScrollBehavior = root.style.scrollBehavior || ''
    }
    root.style.scrollBehavior = 'auto'
  }

  const resetReaderPerformanceEnvironment = () => {
    if (typeof document === 'undefined') {
      return
    }

    const root = document.documentElement
    delete root.dataset.readerPerformanceMode
    root.style.scrollBehavior = previousDocumentScrollBehavior ?? ''
    previousDocumentScrollBehavior = null
  }

  const teardownChapterSyncBindings = () => {
    if (chapterMarkerObserver) {
      chapterMarkerObserver.disconnect()
      chapterMarkerObserver = null
      visibleChapterMarkers.clear()
    }
    if (pendingChapterSyncRafId !== null) {
      window.cancelAnimationFrame(pendingChapterSyncRafId)
      pendingChapterSyncRafId = null
    }
    window.removeEventListener('scroll', debouncedChapterSync)
  }

  const setupChapterSyncBindings = () => {
    const mode = options.settingsStore.config.performanceMode
    const shouldUseObserver = mode !== 'compat'
    if (shouldUseObserver && setupChapterMarkerObserver()) {
      return
    }

    window.addEventListener('scroll', debouncedChapterSync, { passive: true })
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
        if (chapterMarkerObserver && options.settingsStore.config.performanceMode !== 'compat') {
          chapterMarkerObserver.disconnect()
          visibleChapterMarkers.clear()
          setupChapterMarkerObserver()
        }
      })
    },
    { flush: 'post' },
  )

  watch(
    () => options.settingsStore.config.performanceMode,
    () => {
      applyReaderPerformanceEnvironment()
      teardownChapterSyncBindings()
      clearPerformanceObservers()
      setupChapterSyncBindings()
      setupPerformanceObservers()
    },
    { flush: 'post' },
  )

  onMounted(() => {
    applyReaderPerformanceEnvironment()
    setupChapterSyncBindings()
    setupPerformanceObservers()
    window.addEventListener('beforeunload', handleBeforeUnload)
  })

  onUnmounted(() => {
    teardownChapterSyncBindings()
    clearPerformanceObservers()
    resetReaderPerformanceEnvironment()
    window.removeEventListener('beforeunload', handleBeforeUnload)
  })
}
