import { savePersistedReaderProgress } from '@/utils/readerStore'
import type { ReaderStoreState } from '../types'

export function createReaderProgressHandlers(state: ReaderStoreState) {
  let cachedMarkers: HTMLElement[] = []
  let cachedMarkerToken = ''

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
        document.querySelectorAll<HTMLElement>('.chapter-marker[data-chapter-index]'),
      )
    }

    return cachedMarkers
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
      state.currentChapterIndex.value = markerIndex
      state.currentChapter.value =
        state.catalog.value[markerIndex] || state.currentChapter.value
    }
  }

  const saveProgress = () => {
    if (!state.currentBook.value) {
      return
    }

    state.progressMap.value = {
      ...state.progressMap.value,
      [state.currentBook.value.bookUrl]: state.currentChapterIndex.value,
    }
    savePersistedReaderProgress(state.progressMap.value)
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
    updateChapterIndexByScroll,
    saveProgress,
    reset,
    disposeReader,
  }
}
