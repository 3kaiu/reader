import { savePersistedReaderProgress } from '@/utils/readerStore'
import {
  loadPersistedReaderProgressMeta,
  savePersistedReaderProgressMeta,
} from '@/utils/readerStore'
import type { ReaderStoreState } from '../types'

export function createReaderProgressHandlers(state: ReaderStoreState) {
  let cachedMarkers: HTMLElement[] = []
  let cachedMarkerToken = ''

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
    state.diagnosticsRequestId.value = null
    state.diagnosticsPackageId.value = null
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
    reset,
    disposeReader,
  }
}
