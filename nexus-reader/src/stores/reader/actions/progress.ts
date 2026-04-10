import { progressApi } from '@/api/progress'
import { buildReaderContentBookId } from '@/utils/readerStore'
import { savePersistedReaderProgress } from '@/utils/readerStore'
import {
  loadPersistedReaderProgressMeta,
  savePersistedReaderProgressMeta,
} from '@/utils/readerStore'
import type { ReaderStoreState } from '../types'

export function createReaderProgressHandlers(state: ReaderStoreState) {
  let cachedMarkers: HTMLElement[] = []
  let cachedMarkerToken = ''
  let pendingCloudSyncTimer: number | null = null
  let lastCloudSyncAt = 0
  let lastCloudSyncedIndex = -1
  let lastCloudSyncedScrollBucket: number | null = null
  let lastCloudSyncedBookId = ''
  let lastLocalMetaTouchAt = 0
  let lastLocalMetaTouchedIndex = -1
  let lastLocalMetaTouchedScrollBucket: number | null = null

  const touchLocalProgressMeta = () => {
    if (!state.currentBook.value) return
    const bookUrl = state.currentBook.value.bookUrl
    const meta = loadPersistedReaderProgressMeta()
    meta[bookUrl] = {
      index: state.currentChapterIndex.value,
      updatedAt: Date.now(),
    }
    savePersistedReaderProgressMeta(meta)
  }

  const touchLocalProgressMetaWithTimestamp = (updatedAt: number) => {
    if (!state.currentBook.value) return
    if (!Number.isFinite(updatedAt)) return
    const bookUrl = state.currentBook.value.bookUrl
    const meta = loadPersistedReaderProgressMeta()
    const existing = meta[bookUrl]
    const existingUpdatedAt =
      existing && typeof existing.updatedAt === 'number' && Number.isFinite(existing.updatedAt)
        ? existing.updatedAt
        : 0
    const nextUpdatedAt = Math.max(existingUpdatedAt, updatedAt)
    meta[bookUrl] = {
      index: state.currentChapterIndex.value,
      updatedAt: nextUpdatedAt,
    }
    savePersistedReaderProgressMeta(meta)
  }

  const touchLocalProgressMetaThrottled = (options: {
    scrollBucket: number | null
    minIntervalMs: number
  }) => {
    const now = Date.now()
    const index = state.currentChapterIndex.value
    const scrollBucket = options.scrollBucket
    if (
      now - lastLocalMetaTouchAt < options.minIntervalMs &&
      index === lastLocalMetaTouchedIndex &&
      scrollBucket === lastLocalMetaTouchedScrollBucket
    ) {
      return
    }
    lastLocalMetaTouchAt = now
    lastLocalMetaTouchedIndex = index
    lastLocalMetaTouchedScrollBucket = scrollBucket
    touchLocalProgressMeta()
  }

  const scheduleCloudProgressSync = (options?: {
    reason?: string
    scrollPercent?: number
  }) => {
    if (typeof window === 'undefined') {
      return
    }
    if (!state.currentBook.value) {
      return
    }
    // Read current state when the timer fires to avoid syncing stale chapters.

    // Avoid spamming writes while scrolling; keep a small throttle window.
    const now = Date.now()
    const minIntervalMs = 2500
    const dueIn = Math.max(0, minIntervalMs - (now - lastCloudSyncAt))

    if (pendingCloudSyncTimer !== null && pendingCloudSyncTimer >= 0) {
      window.clearTimeout(pendingCloudSyncTimer)
      pendingCloudSyncTimer = null
    }

    pendingCloudSyncTimer = window.setTimeout(() => {
      pendingCloudSyncTimer = null
      if (!state.currentBook.value) return

      const currentBookId = buildReaderContentBookId(state.currentBook.value)
      const currentIndex = state.currentChapterIndex.value
      const scrollPercent = options?.scrollPercent
      const scrollBucket =
        typeof scrollPercent === 'number' && Number.isFinite(scrollPercent)
          ? Math.max(0, Math.min(100, Math.round(scrollPercent / 2) * 2))
          : null

      // Keep local "newness" aligned with our cloud sync throttle and semantic buckets.
      touchLocalProgressMetaThrottled({
        scrollBucket,
        minIntervalMs,
      })

      if (
        currentBookId === lastCloudSyncedBookId &&
        currentIndex === lastCloudSyncedIndex &&
        (scrollBucket === null || scrollBucket === lastCloudSyncedScrollBucket)
      ) {
        return
      }

      lastCloudSyncAt = Date.now()
      void progressApi
        .put(currentBookId, {
          chapterIndex: currentIndex,
          ...(scrollBucket === null ? {} : { scrollPercent: scrollBucket }),
          ...(scrollBucket === null ? {} : { scrollKind: 'chapter' as const }),
          updatedAt: lastCloudSyncAt,
        })
        .then(res => {
          // Prefer server time + normalized progress snapshot when available.
          const snapshot = res.isSuccess ? res.data?.progress : null
          const serverUpdatedAt =
            snapshot && typeof snapshot.serverUpdatedAt === 'number' && Number.isFinite(snapshot.serverUpdatedAt)
              ? snapshot.serverUpdatedAt
              : snapshot && typeof snapshot.updatedAt === 'number' && Number.isFinite(snapshot.updatedAt)
                ? snapshot.updatedAt
                : null

          if (serverUpdatedAt !== null) {
            lastCloudSyncAt = serverUpdatedAt
            // Align local "newness" with server time without regressing timestamps.
            touchLocalProgressMetaWithTimestamp(serverUpdatedAt)
          }

          lastCloudSyncedBookId = currentBookId
          if (snapshot && typeof snapshot.chapterIndex === 'number' && Number.isFinite(snapshot.chapterIndex)) {
            lastCloudSyncedIndex = Math.max(0, Math.trunc(snapshot.chapterIndex))
          } else {
            lastCloudSyncedIndex = currentIndex
          }
          if (snapshot && typeof snapshot.scrollPercent === 'number' && Number.isFinite(snapshot.scrollPercent)) {
            lastCloudSyncedScrollBucket = Math.max(
              0,
              Math.min(100, Math.round(snapshot.scrollPercent / 2) * 2)
            )
          } else {
            lastCloudSyncedScrollBucket = scrollBucket
          }
        })
        .catch(() => undefined)
    }, dueIn)

    void options
  }

  const resolveMarkerToken = () => {
    const loadedChapters = state.loadedChapters.value
    const firstIndex = loadedChapters[0]?.index ?? -1
    const lastIndex = loadedChapters[loadedChapters.length - 1]?.index ?? -1
    return `${loadedChapters.length}:${firstIndex}:${lastIndex}`
  }

  const getChapterMarkers = () => {
    const nextToken = resolveMarkerToken()
    const shouldRefresh =
      nextToken !== cachedMarkerToken ||
      cachedMarkers.length === 0 ||
      cachedMarkers.some(marker => !marker.isConnected)

    if (shouldRefresh) {
      cachedMarkerToken = nextToken
      cachedMarkers = Array.from(
        document.querySelectorAll<HTMLElement>('.chapter-marker[data-chapter-index]')
      )
    }

    return cachedMarkers
  }

  const syncCurrentChapterByIndex = (chapterIndex: number) => {
    if (!Number.isFinite(chapterIndex) || chapterIndex < 0) {
      return
    }

    if (state.currentChapterIndex.value === chapterIndex) {
      return
    }

    state.currentChapterIndex.value = chapterIndex
    state.currentChapter.value = state.catalog.value[chapterIndex] || state.currentChapter.value
    // Best-effort: persist and sync for multi-device resume.
    saveProgress()
  }

  const updateChapterIndexByScroll = () => {
    if (state.loadedChapters.value.length === 0 || typeof document === 'undefined') {
      return
    }

    const chapterMarkers = getChapterMarkers()
    if (chapterMarkers.length === 0) {
      return
    }

    const targetLine = window.innerHeight * 0.35
    let currentMarker: HTMLElement | null = null
    let fallbackMarker: HTMLElement | null = null

    for (const marker of chapterMarkers) {
      const rect = marker.getBoundingClientRect()
      if (rect.top <= targetLine && rect.bottom >= 0) {
        currentMarker = marker
        break
      }
      if (rect.top <= targetLine) {
        fallbackMarker = marker
      }
      if (rect.top > targetLine && fallbackMarker) {
        break
      }
    }

    const resolvedMarker = currentMarker || fallbackMarker

    if (!resolvedMarker) {
      return
    }

    const markerIndex = Number(resolvedMarker.dataset.chapterIndex)
    if (!Number.isNaN(markerIndex)) {
      syncCurrentChapterByIndex(markerIndex)
    }
  }

  const saveProgress = () => {
    if (!state.currentBook.value) {
      return
    }

    const bookUrl = state.currentBook.value.bookUrl
    state.progressMap.value = {
      ...state.progressMap.value,
      [bookUrl]: state.currentChapterIndex.value,
    }
    savePersistedReaderProgress(state.progressMap.value)
    touchLocalProgressMeta()

    scheduleCloudProgressSync({ reason: 'saveProgress' })
  }

  const syncScrollPercent = (scrollPercent: number) => {
    if (!state.currentBook.value) return
    if (!Number.isFinite(scrollPercent)) return
    scheduleCloudProgressSync({ reason: 'scroll', scrollPercent })
  }

  const reset = () => {
    cachedMarkers = []
    cachedMarkerToken = ''
    state.currentBook.value = null
    state.currentChapter.value = null
    state.currentChapterIndex.value = 0
    state.content.value = ''
    state.formattedContent.value = ''
    state.catalog.value = []
    state.loadedChapters.value = []
    state.isLoading.value = false
    state.isLoadingMore.value = false
    state.isParsing.value = false
    state.error.value = null
    state.loadError.value = null
    state.loadErrorDetails.value = null
    state.chapterContentCache.value = {}
    state.contentStageReports.value = []
  }

  const disposeReader = () => {
    saveProgress()
    reset()
  }

  return {
    syncCurrentChapterByIndex,
    updateChapterIndexByScroll,
    saveProgress,
    syncScrollPercent,
    reset,
    disposeReader,
  }
}
