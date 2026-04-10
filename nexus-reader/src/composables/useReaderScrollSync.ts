import { nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useScroll, useThrottleFn } from '@vueuse/core'
import { networkDetector } from '@/services/network/optimizer'
import { getPerformanceMonitor } from '@/services/network/optimizer/runtime'
import { logger } from '@/utils/logger'
import { hasPendingUserInput } from '@/utils/browserScheduling'
import { useReaderStore } from '@/stores/reader'
import { useSettingsStore } from '@/stores/settings'

type ReaderWakeLockSentinel = {
  release: () => Promise<void>
  addEventListener: (type: 'release', listener: () => void) => void
}

type ReaderWakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: 'screen') => Promise<ReaderWakeLockSentinel>
  }
}

export function useReaderScrollSync(options: {
  readerStore: ReturnType<typeof useReaderStore>
  settingsStore: ReturnType<typeof useSettingsStore>
}) {
  const { arrivedState } = useScroll(window, { offset: { bottom: 200 } })
  const handleBeforeUnload = () => options.readerStore.saveProgress()
  let lastAutoAppendAt = 0
  let pageActive = true
  const shouldSampleMetric = () => {
    const rate = options.settingsStore.config.perfTelemetrySampleRate
    if (!Number.isFinite(rate) || rate <= 0) {
      return false
    }
    if (rate >= 1) {
      return true
    }
    return Math.random() < rate
  }

  const reportReaderMetric = (
    name: string,
    value: number,
    context: Record<string, unknown> = {}
  ) => {
    if (!shouldSampleMetric()) {
      return
    }

    const performanceMonitor = getPerformanceMonitor()
    if (!performanceMonitor) {
      return
    }

    performanceMonitor.reportMetric(name, value, {
      ...context,
      readerPerformanceMode: options.settingsStore.config.performanceMode,
      chapterIndex: options.readerStore.currentChapterIndex,
    })
  }
  const handleVisibilityChange = () => {
    const hidden = typeof document !== 'undefined' ? document.visibilityState === 'hidden' : false
    pageActive = !hidden
    if (!pageActive) {
      teardownChapterSyncBindings()
      clearPerformanceObservers()
      void releaseReaderWakeLock()
      return
    }

    setupChapterSyncBindings()
    setupPerformanceObservers()
    void requestReaderWakeLock()
  }
  const handlePageHide = () => {
    pageActive = false
    teardownChapterSyncBindings()
    clearPerformanceObservers()
    void releaseReaderWakeLock()
  }

  const handlePageShow = (event: PageTransitionEvent) => {
    pageActive = true
    setupChapterSyncBindings()
    setupPerformanceObservers()
    void requestReaderWakeLock()
    if (event.persisted) {
      void nextTick(() => {
        options.readerStore.updateChapterIndexByScroll()
      })
      reportReaderMetric('reader_bfcache_restore', 1)
    }
  }

  const debouncedAppendNext = useThrottleFn(async () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return
    }

    const adaptivePrefetchEnabled = options.settingsStore.config.adaptivePrefetchEnabled
    const networkInfo = adaptivePrefetchEnabled ? networkDetector.getNetworkInfo() : null
    if (networkInfo && (!networkInfo.isOnline || networkInfo.saveData)) {
      return
    }
    if (networkInfo?.effectiveType === '2g' || networkInfo?.effectiveType === 'slow-2g') {
      return
    }
    if (networkInfo?.effectiveType === '3g') {
      const now = Date.now()
      if (now - lastAutoAppendAt < 2500) {
        return
      }
      lastAutoAppendAt = now
    }

    if (options.readerStore.hasNextChapter && !options.readerStore.isLoadingMore) {
      const appendStartAt = performance.now()
      const success = await options.readerStore.appendNextChapter()
      reportReaderMetric('reader_append_next_duration', performance.now() - appendStartAt, {
        success,
        networkType: networkInfo?.effectiveType || 'unknown',
        saveData: Boolean(networkInfo?.saveData),
      })
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

  const debouncedCloudScrollSync = useThrottleFn(() => {
    if (typeof document === 'undefined') return
    const markerSelector = '.chapter-marker[data-chapter-index]'
    const markers = Array.from(document.querySelectorAll<HTMLElement>(markerSelector))
      .map(marker => ({
        el: marker,
        index: Number(marker.dataset.chapterIndex),
      }))
      .filter(item => Number.isFinite(item.index))
      .sort((a, b) => a.index - b.index)

    if (markers.length === 0) return

    const currentIndex = options.readerStore.currentChapterIndex
    const currentPos = markers.findIndex(m => m.index === currentIndex)
    const currentMarker = currentPos >= 0 ? markers[currentPos] : null
    if (!currentMarker) return

    const nextMarker = markers.find((m, idx) => idx > currentPos && m.index > currentIndex) || null

    const currentBlock = currentMarker.el.closest<HTMLElement>('.reader-chapter-block')
    const nextBlock = nextMarker?.el.closest<HTMLElement>('.reader-chapter-block') || null
    if (!currentBlock) return

    const doc = document.documentElement
    const viewportH = window.innerHeight || 1
    const maxDocScroll = Math.max(1, doc.scrollHeight - viewportH)
    const y = Math.max(0, Math.min(maxDocScroll, window.scrollY || doc.scrollTop || 0))
    const chapterStartRaw = currentBlock.getBoundingClientRect().top + y
    const chapterStart = Math.max(0, Math.min(maxDocScroll, chapterStartRaw))
    const chapterEndRaw =
      (nextBlock ? nextBlock.getBoundingClientRect().top + y : doc.scrollHeight) - viewportH * 0.35
    const chapterEnd = Math.max(chapterStart + 1, Math.min(maxDocScroll, chapterEndRaw))
    const percent = ((y - chapterStart) / Math.max(1, chapterEnd - chapterStart)) * 100
    options.readerStore.syncScrollPercent(Math.max(0, Math.min(100, percent)))
  }, 1500)
  const chapterMarkerSelector = '.chapter-marker[data-chapter-index]'
  let chapterMarkerObserver: IntersectionObserver | null = null
  const visibleChapterMarkers = new Set<HTMLElement>()
  let pendingChapterSyncRafId: number | null = null
  let pendingMarkerRebindRafId: number | null = null
  let performanceObservers: PerformanceObserver[] = []
  let previousDocumentScrollBehavior: string | null = null
  let wakeLockSentinel: ReaderWakeLockSentinel | null = null
  let wakeLockRequestInFlight = false
  let pendingSyncDefers = 0
  let pendingRebindDefers = 0
  const performanceLogLastAt = new Map<string, number>()
  const PERFORMANCE_LOG_THROTTLE_MS = 3000
  const MAX_INPUT_PENDING_DEFERS = 4

  const logPerformanceEvent = (
    kind: 'longtask' | 'layout-shift' | 'event',
    payload: Record<string, unknown>
  ) => {
    const now = Date.now()
    const lastAt = performanceLogLastAt.get(kind) || 0
    if (now - lastAt < PERFORMANCE_LOG_THROTTLE_MS) {
      return
    }
    performanceLogLastAt.set(kind, now)
    logger.debug(`reader ${kind} detected`, payload)
  }

  const shouldHoldWakeLock = () => {
    if (typeof document === 'undefined') {
      return false
    }
    if (!options.settingsStore.config.wakeLockEnabled) {
      return false
    }
    if (!pageActive) {
      return false
    }
    return document.visibilityState !== 'hidden'
  }

  const requestReaderWakeLock = async () => {
    if (wakeLockRequestInFlight || wakeLockSentinel || !shouldHoldWakeLock()) {
      return
    }
    if (typeof navigator === 'undefined') {
      return
    }

    const wakeLockNavigator = navigator as ReaderWakeLockNavigator
    if (!wakeLockNavigator.wakeLock) {
      return
    }

    wakeLockRequestInFlight = true
    try {
      wakeLockSentinel = await wakeLockNavigator.wakeLock.request('screen')
      wakeLockSentinel.addEventListener('release', () => {
        wakeLockSentinel = null
        if (shouldHoldWakeLock()) {
          void requestReaderWakeLock()
        }
      })
    } catch (error) {
      logger.debug('Wake lock request failed', { error })
    } finally {
      wakeLockRequestInFlight = false
    }
  }

  const releaseReaderWakeLock = async () => {
    if (!wakeLockSentinel) {
      return
    }

    const currentSentinel = wakeLockSentinel
    wakeLockSentinel = null
    try {
      await currentSentinel.release()
    } catch (error) {
      logger.debug('Wake lock release failed', { error })
    }
  }

  const syncChapterByVisibleMarkers = () => {
    if (!pageActive) {
      return
    }

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
    if (!pageActive) {
      return
    }

    if (pendingChapterSyncRafId !== null) {
      return
    }

    pendingChapterSyncRafId = window.requestAnimationFrame(() => {
      if (hasPendingUserInput() && pendingSyncDefers < MAX_INPUT_PENDING_DEFERS) {
        pendingSyncDefers += 1
        pendingChapterSyncRafId = null
        scheduleChapterSyncByVisibleMarkers()
        return
      }
      pendingSyncDefers = 0
      pendingChapterSyncRafId = null
      syncChapterByVisibleMarkers()
    })
  }

  const scheduleMarkerObserverRebind = () => {
    if (!pageActive) {
      return
    }

    if (pendingMarkerRebindRafId !== null) {
      return
    }

    pendingMarkerRebindRafId = window.requestAnimationFrame(() => {
      if (hasPendingUserInput() && pendingRebindDefers < MAX_INPUT_PENDING_DEFERS) {
        pendingRebindDefers += 1
        pendingMarkerRebindRafId = null
        scheduleMarkerObserverRebind()
        return
      }
      pendingRebindDefers = 0
      pendingMarkerRebindRafId = null
      if (chapterMarkerObserver && options.settingsStore.config.performanceMode !== 'compat') {
        chapterMarkerObserver.disconnect()
        visibleChapterMarkers.clear()
        setupChapterMarkerObserver()
      }
    })
  }

  const setupChapterMarkerObserver = () => {
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      return false
    }

    const mode = options.settingsStore.config.performanceMode
    const observerRootMargin = mode === 'aggressive' ? '-30% 0px -50% 0px' : '-35% 0px -45% 0px'
    const observerThreshold = mode === 'aggressive' ? [0, 1] : [0, 0.25, 0.5, 1]

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
          rootMargin: observerRootMargin,
          threshold: observerThreshold,
        }
      )
    }

    visibleChapterMarkers.clear()
    const chapterMarkers = Array.from(document.querySelectorAll<HTMLElement>(chapterMarkerSelector))
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
      !import.meta.env.DEV ||
      typeof window === 'undefined' ||
      typeof PerformanceObserver === 'undefined' ||
      options.settingsStore.config.performanceMode === 'compat'
    ) {
      return
    }

    const supportedEntryTypes = PerformanceObserver.supportedEntryTypes || []

    if (supportedEntryTypes.includes('longtask')) {
      const longTaskObserver = new PerformanceObserver(list => {
        list.getEntries().forEach(entry => {
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
      const layoutShiftObserver = new PerformanceObserver(list => {
        list.getEntries().forEach(entry => {
          const shiftEntry = entry as PerformanceEntry & {
            value?: number
            hadRecentInput?: boolean
          }
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
      const eventObserver = new PerformanceObserver(list => {
        list.getEntries().forEach(entry => {
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
    pendingSyncDefers = 0
    if (pendingMarkerRebindRafId !== null) {
      window.cancelAnimationFrame(pendingMarkerRebindRafId)
      pendingMarkerRebindRafId = null
    }
    pendingRebindDefers = 0
    window.removeEventListener('scroll', debouncedChapterSync)
    window.removeEventListener('scroll', debouncedCloudScrollSync)
  }

  const setupChapterSyncBindings = () => {
    if (!pageActive) {
      return
    }

    const mode = options.settingsStore.config.performanceMode
    const shouldUseObserver = mode !== 'compat'
    if (shouldUseObserver && setupChapterMarkerObserver()) {
      return
    }

    window.addEventListener('scroll', debouncedChapterSync, { passive: true })
    window.addEventListener('scroll', debouncedCloudScrollSync, { passive: true })
  }

  const applyPendingScrollResume = async () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    const percent = options.readerStore.resumeScrollPercent
    const targetIndex = options.readerStore.resumeScrollChapterIndex
    if (typeof percent !== 'number' || !Number.isFinite(percent)) return
    if (typeof targetIndex !== 'number' || !Number.isFinite(targetIndex)) return
    if (options.readerStore.currentChapterIndex !== targetIndex) return

    // Clear first to avoid re-entrancy loops.
    options.readerStore.resumeScrollPercent = null
    options.readerStore.resumeScrollChapterIndex = null

    await nextTick()
    const markerSelector = '.chapter-marker[data-chapter-index]'
    const markers = Array.from(document.querySelectorAll<HTMLElement>(markerSelector))
      .map(marker => ({
        el: marker,
        index: Number(marker.dataset.chapterIndex),
      }))
      .filter(item => Number.isFinite(item.index))
      .sort((a, b) => a.index - b.index)

    if (markers.length === 0) {
      return
    }

    const currentPos = markers.findIndex(m => m.index === targetIndex)
    const currentMarker = currentPos >= 0 ? markers[currentPos] : null
    if (!currentMarker) {
      return
    }

    const nextMarker = markers.find((m, idx) => idx > currentPos && m.index > targetIndex) || null
    const doc = document.documentElement
    const viewportH = window.innerHeight || 1
    const maxDocScroll = Math.max(1, doc.scrollHeight - viewportH)

    const currentBlock = currentMarker.el.closest<HTMLElement>('.reader-chapter-block')
    const nextBlock = nextMarker?.el.closest<HTMLElement>('.reader-chapter-block') || null
    if (!currentBlock) {
      return
    }

    const currentY = Math.max(0, Math.min(maxDocScroll, window.scrollY || doc.scrollTop || 0))
    const chapterStartRaw = currentBlock.getBoundingClientRect().top + currentY
    const chapterStart = Math.max(0, Math.min(maxDocScroll, chapterStartRaw))
    const chapterEndRaw =
      (nextBlock ? nextBlock.getBoundingClientRect().top + currentY : doc.scrollHeight) - viewportH * 0.35
    const chapterEnd = Math.max(chapterStart + 1, Math.min(maxDocScroll, chapterEndRaw))

    const y =
      chapterStart + (Math.max(0, Math.min(100, percent)) / 100) * Math.max(1, chapterEnd - chapterStart)
    window.scrollTo({ top: Math.max(0, Math.min(maxDocScroll, y)), behavior: 'auto' })

    // Best-effort correction: layout/virtualization can cause resume landing in wrong chapter.
    requestAnimationFrame(() => {
      const line = window.innerHeight * 0.35
      let resolved: number | null = null
      for (const marker of markers) {
        const rect = marker.el.getBoundingClientRect()
        if (rect.top <= line && rect.bottom >= 0) {
          resolved = marker.index
          break
        }
        if (rect.top <= line) {
          resolved = marker.index
        }
        if (rect.top > line && resolved !== null) {
          break
        }
      }

      if (resolved === null || resolved === targetIndex) {
        return
      }

      const targetMarker = markers.find(m => m.index === targetIndex) || null
      const targetBlock = targetMarker?.el.closest<HTMLElement>('.reader-chapter-block') || null
      if (!targetBlock) {
        return
      }
      const currY = Math.max(0, Math.min(maxDocScroll, window.scrollY || doc.scrollTop || 0))
      const top = Math.max(0, Math.min(maxDocScroll, targetBlock.getBoundingClientRect().top + currY))
      window.scrollTo({ top, behavior: 'auto' })
    })
  }

  watch(
    () => arrivedState.bottom,
    isBottom => {
      if (!pageActive) {
        return
      }

      if (isBottom) {
        if (!options.readerStore.loadError) {
          debouncedAppendNext()
        }
      }
    }
  )

  watch(
    () => options.readerStore.currentChapterIndex,
    () => {
      // Best-effort scroll resume for multi-device progress.
      void applyPendingScrollResume()
    },
    { flush: 'post' }
  )

  watch(
    () => {
      const chapters = options.readerStore.loadedChapters
      const firstIndex = chapters[0]?.index ?? -1
      const lastIndex = chapters[chapters.length - 1]?.index ?? -1
      return `${chapters.length}:${firstIndex}:${lastIndex}`
    },
    () => {
      if (!pageActive) {
        return
      }

      void nextTick(() => {
        scheduleMarkerObserverRebind()
      })
    },
    { flush: 'post' }
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
    { flush: 'post' }
  )

  watch(
    () => options.settingsStore.config.wakeLockEnabled,
    enabled => {
      if (!enabled) {
        void releaseReaderWakeLock()
        return
      }
      void requestReaderWakeLock()
    }
  )

  onMounted(() => {
    pageActive = typeof document !== 'undefined' ? document.visibilityState !== 'hidden' : true
    applyReaderPerformanceEnvironment()
    setupChapterSyncBindings()
    setupPerformanceObservers()
    void requestReaderWakeLock()
    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('pageshow', handlePageShow)
    document.addEventListener('visibilitychange', handleVisibilityChange)
  })

  onUnmounted(() => {
    teardownChapterSyncBindings()
    clearPerformanceObservers()
    void releaseReaderWakeLock()
    resetReaderPerformanceEnvironment()
    window.removeEventListener('beforeunload', handleBeforeUnload)
    window.removeEventListener('pagehide', handlePageHide)
    window.removeEventListener('pageshow', handlePageShow)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  })
}
