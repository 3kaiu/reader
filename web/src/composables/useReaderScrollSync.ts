import { nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useScroll, useThrottleFn } from '@vueuse/core'
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

// ──────── 纯工具函数 ────────

function shouldHoldWakeLock(
  settingsStore: ReturnType<typeof useSettingsStore>,
  pageActive: boolean
): boolean {
  if (typeof document === 'undefined') return false
  if (!settingsStore.config.wakeLockEnabled) return false
  if (!pageActive) return false
  return document.visibilityState !== 'hidden'
}

function logPerformanceEventThrottled(
  kind: 'longtask' | 'layout-shift' | 'event',
  payload: Record<string, unknown>,
  logLastAt: Map<string, number>,
  throttleMs: number
) {
  const now = Date.now()
  const lastAt = logLastAt.get(kind) || 0
  if (now - lastAt < throttleMs) return
  logLastAt.set(kind, now)
  logger.debug(`reader ${kind} detected`, payload)
}

// ──────── WakeLock 管理 ────────

function createWakeLockManager(
  settingsStore: ReturnType<typeof useSettingsStore>,
  getPageActive: () => boolean
) {
  let sentinel: ReaderWakeLockSentinel | null = null
  let requestInFlight = false

  const request = async () => {
    if (requestInFlight || sentinel || !shouldHoldWakeLock(settingsStore, getPageActive())) return
    if (typeof navigator === 'undefined') return

    const wakeLockNavigator = navigator as ReaderWakeLockNavigator
    if (!wakeLockNavigator.wakeLock) return

    requestInFlight = true
    try {
      sentinel = await wakeLockNavigator.wakeLock.request('screen')
      sentinel.addEventListener('release', () => {
        sentinel = null
        if (shouldHoldWakeLock(settingsStore, getPageActive())) {
          void request()
        }
      })
    } catch (error) {
      logger.debug('Wake lock request failed', { error })
    } finally {
      requestInFlight = false
    }
  }

  const release = async () => {
    if (!sentinel) return
    const current = sentinel
    sentinel = null
    try {
      await current.release()
    } catch (error) {
      logger.debug('Wake lock release failed', { error })
    }
  }

  return { request, release }
}

// ──────── Performance Observer 管理 ────────

function createPerformanceObserverManager(
  settingsStore: ReturnType<typeof useSettingsStore>,
  readerStore: ReturnType<typeof useReaderStore>
) {
  const observers: PerformanceObserver[] = []
  const logLastAt = new Map<string, number>()
  const LOG_THROTTLE = 3000

  const log = (kind: 'longtask' | 'layout-shift' | 'event', payload: Record<string, unknown>) =>
    logPerformanceEventThrottled(kind, payload, logLastAt, LOG_THROTTLE)

  const setup = () => {
    if (
      !import.meta.env.DEV ||
      typeof window === 'undefined' ||
      typeof PerformanceObserver === 'undefined' ||
      settingsStore.config.performanceMode === 'compat'
    ) {
      return
    }

    const supported = PerformanceObserver.supportedEntryTypes || []

    if (supported.includes('longtask')) {
      const observer = new PerformanceObserver(list => {
        list.getEntries().forEach(entry => {
          if (entry.duration >= 50) {
            log('longtask', { duration: Number(entry.duration.toFixed(1)), chapterIndex: readerStore.currentChapterIndex, loadedChapters: readerStore.loadedChapters.length })
          }
        })
      })
      observer.observe({ type: 'longtask', buffered: true })
      observers.push(observer)
    }

    if (supported.includes('layout-shift')) {
      const observer = new PerformanceObserver(list => {
        list.getEntries().forEach(entry => {
          const shiftEntry = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean }
          if (!shiftEntry.hadRecentInput && (shiftEntry.value || 0) > 0.04) {
            log('layout-shift', { value: Number((shiftEntry.value || 0).toFixed(4)), chapterIndex: readerStore.currentChapterIndex })
          }
        })
      })
      observer.observe({ type: 'layout-shift', buffered: true })
      observers.push(observer)
    }

    if (supported.includes('event')) {
      const observer = new PerformanceObserver(list => {
        list.getEntries().forEach(entry => {
          if (entry.duration >= 120) {
            log('event', { name: entry.name, duration: Number(entry.duration.toFixed(1)), chapterIndex: readerStore.currentChapterIndex })
          }
        })
      })
      observer.observe({ type: 'event', buffered: true } as PerformanceObserverInit)
      observers.push(observer)
    }
  }

  const clear = () => {
    observers.forEach(o => o.disconnect())
    observers.length = 0
  }

  return { setup, clear }
}

// ──────── Performance Environment 管理 ────────

function createPerformanceEnvironmentManager() {
  let previousScrollBehavior: string | null = null

  const apply = (mode: string) => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    root.dataset.readerPerformanceMode = mode
    if (previousScrollBehavior === null) {
      previousScrollBehavior = root.style.scrollBehavior || ''
    }
    root.style.scrollBehavior = 'auto'
  }

  const reset = () => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    delete root.dataset.readerPerformanceMode
    root.style.scrollBehavior = previousScrollBehavior ?? ''
    previousScrollBehavior = null
  }

  return { apply, reset }
}

// ──────── 章节滑动同步 ────────

function createChapterScrollSync(
  readerStore: ReturnType<typeof useReaderStore>,
  settingsStore: ReturnType<typeof useSettingsStore>,
  getPageActive: () => boolean
) {
  const debouncedChapterSync = useThrottleFn(() => {
    readerStore.updateChapterIndexByScroll()
  }, 500)

  const chapterMarkerSelector = '.chapter-marker[data-chapter-index]'
  let observer: IntersectionObserver | null = null
  const visibleMarkers = new Set<HTMLElement>()
  let pendingSyncRafId: number | null = null
  let pendingRebindRafId: number | null = null
  let syncDefers = 0
  let rebindDefers = 0
  const MAX_DEFERS = 4

  const syncByVisibleMarkers = () => {
    if (!getPageActive()) return

    if (visibleMarkers.size === 0) {
      readerStore.updateChapterIndexByScroll()
      return
    }

    const targetLine = window.innerHeight * 0.35
    let resolvedIndex: number | null = null
    let minDistance = Number.POSITIVE_INFINITY

    visibleMarkers.forEach(marker => {
      if (!marker.isConnected) { visibleMarkers.delete(marker); return }
      const chapterIndex = Number(marker.dataset.chapterIndex)
      if (Number.isNaN(chapterIndex)) return
      const distance = Math.abs(marker.getBoundingClientRect().top - targetLine)
      if (distance < minDistance) { minDistance = distance; resolvedIndex = chapterIndex }
    })

    if (resolvedIndex !== null) {
      readerStore.syncCurrentChapterByIndex(resolvedIndex)
      return
    }
    readerStore.updateChapterIndexByScroll()
  }

  const scheduleSync = () => {
    if (!getPageActive() || pendingSyncRafId !== null) return
    pendingSyncRafId = window.requestAnimationFrame(() => {
      if (hasPendingUserInput() && syncDefers < MAX_DEFERS) { syncDefers += 1; pendingSyncRafId = null; scheduleSync(); return }
      syncDefers = 0; pendingSyncRafId = null; syncByVisibleMarkers()
    })
  }

  const scheduleRebind = () => {
    if (!getPageActive() || pendingRebindRafId !== null) return
    pendingRebindRafId = window.requestAnimationFrame(() => {
      if (hasPendingUserInput() && rebindDefers < MAX_DEFERS) { rebindDefers += 1; pendingRebindRafId = null; scheduleRebind(); return }
      rebindDefers = 0; pendingRebindRafId = null
      if (observer) { observer.disconnect(); visibleMarkers.clear(); setupObserver() }
    })
  }

  const setupObserver = () => {
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return false
    const mode = settingsStore.config.performanceMode
    const rootMargin = mode === 'aggressive' ? '-30% 0px -50% 0px' : '-35% 0px -45% 0px'
    const threshold = mode === 'aggressive' ? [0, 1] : [0, 0.25, 0.5, 1]

    if (!observer) {
      observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          const marker = entry.target as HTMLElement
          if (entry.isIntersecting) visibleMarkers.add(marker)
          else visibleMarkers.delete(marker)
        })
        scheduleSync()
      }, { root: null, rootMargin, threshold })
    }

    visibleMarkers.clear()
    document.querySelectorAll<HTMLElement>(chapterMarkerSelector).forEach(marker => observer?.observe(marker))
    scheduleSync()
    return true
  }

  const teardown = () => {
    if (observer) { observer.disconnect(); observer = null; visibleMarkers.clear() }
    if (pendingSyncRafId !== null) { window.cancelAnimationFrame(pendingSyncRafId); pendingSyncRafId = null }
    if (pendingRebindRafId !== null) { window.cancelAnimationFrame(pendingRebindRafId); pendingRebindRafId = null }
    syncDefers = 0; rebindDefers = 0
    window.removeEventListener('scroll', debouncedChapterSync)
  }

  const setup = () => {
    if (!getPageActive()) return
    if (!setupObserver()) {
      window.addEventListener('scroll', debouncedChapterSync, { passive: true })
    }
  }

  return { setup, teardown, debouncedChapterSync, scheduleRebind }
}

// ──────── 主动加载下一章 ────────

function createAutoAppendNext(
  readerStore: ReturnType<typeof useReaderStore>,
  settingsStore: ReturnType<typeof useSettingsStore>
) {
  const debouncedAppendNext = useThrottleFn(async () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return

    const adaptivePrefetchEnabled = settingsStore.config.adaptivePrefetchEnabled
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true
    if (adaptivePrefetchEnabled && !isOnline) return

    if (readerStore.hasNextChapter && !readerStore.isLoadingMore) {
      const success = await readerStore.appendNextChapter()
      if (!success) {
        logger.warn('自动加载下一章失败，显示重试选项', { loadError: readerStore.loadError })
      }
    }
  }, 1000)

  return debouncedAppendNext
}

// ═══════════════════════════════════════════════════════════════════════
// 主 composable
// ═══════════════════════════════════════════════════════════════════════

export function useReaderScrollSync(options: {
  readerStore: ReturnType<typeof useReaderStore>
  settingsStore: ReturnType<typeof useSettingsStore>
}) {
  const { arrivedState } = useScroll(window, { offset: { bottom: 200 } })
  let pageActive = true

  // 创建子管理器
  const wakeLock = createWakeLockManager(options.settingsStore, () => pageActive)
  const perfObserver = createPerformanceObserverManager(options.settingsStore, options.readerStore)
  const perfEnv = createPerformanceEnvironmentManager()
  const chapterSync = createChapterScrollSync(options.readerStore, options.settingsStore, () => pageActive)
  const appendNext = createAutoAppendNext(options.readerStore, options.settingsStore)

  // ── 生命周期回调 ──

  const handleBeforeUnload = () => options.readerStore.saveProgress()

  const handleVisibilityChange = () => {
    const hidden = typeof document !== 'undefined' ? document.visibilityState === 'hidden' : false
    pageActive = !hidden
    if (!pageActive) {
      chapterSync.teardown()
      perfObserver.clear()
      void wakeLock.release()
      return
    }
    chapterSync.setup()
    perfObserver.setup()
    void wakeLock.request()
  }

  const handlePageHide = () => {
    pageActive = false
    chapterSync.teardown()
    perfObserver.clear()
    void wakeLock.release()
  }

  const handlePageShow = (event: PageTransitionEvent) => {
    pageActive = true
    chapterSync.setup()
    perfObserver.setup()
    void wakeLock.request()
    if (event.persisted) {
      void nextTick(() => options.readerStore.updateChapterIndexByScroll())
    }
  }

  // ── Watchers ──

  watch(
    () => arrivedState.bottom,
    isBottom => {
      if (!pageActive) return
      if (isBottom && !options.readerStore.loadError) {
        appendNext()
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
      if (!pageActive) return
      void nextTick(() => chapterSync.scheduleRebind())
    },
    { flush: 'post' }
  )

  watch(
    () => options.settingsStore.config.performanceMode,
    () => {
      perfEnv.apply(options.settingsStore.config.performanceMode)
      chapterSync.teardown()
      perfObserver.clear()
      chapterSync.setup()
      perfObserver.setup()
    },
    { flush: 'post' }
  )

  watch(
    () => options.settingsStore.config.wakeLockEnabled,
    enabled => {
      if (!enabled) { void wakeLock.release(); return }
      void wakeLock.request()
    }
  )

  // ── 挂载/卸载 ──

  onMounted(() => {
    pageActive = typeof document !== 'undefined' ? document.visibilityState !== 'hidden' : true
    perfEnv.apply(options.settingsStore.config.performanceMode)
    chapterSync.setup()
    perfObserver.setup()
    void wakeLock.request()
    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('pageshow', handlePageShow)
    document.addEventListener('visibilitychange', handleVisibilityChange)
  })

  onUnmounted(() => {
    chapterSync.teardown()
    perfObserver.clear()
    void wakeLock.release()
    perfEnv.reset()
    window.removeEventListener('beforeunload', handleBeforeUnload)
    window.removeEventListener('pagehide', handlePageHide)
    window.removeEventListener('pageshow', handlePageShow)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  })
}