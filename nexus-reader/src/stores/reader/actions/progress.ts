import { savePersistedReaderProgress } from '@/utils/readerStore'
import type { ReaderStoreState } from '../types'

export function createReaderProgressHandlers(state: ReaderStoreState) {
  const updateChapterIndexByScroll = () => {
    if (state.loadedChapters.value.length === 0 || typeof document === 'undefined') {
      return
    }

    const chapterMarkers = Array.from(
      document.querySelectorAll<HTMLElement>('[data-chapter-index]'),
    )

    const currentMarker = chapterMarkers.find((marker) => {
      const rect = marker.getBoundingClientRect()
      return rect.top <= window.innerHeight * 0.35 && rect.bottom >= 0
    })

    if (!currentMarker) {
      return
    }

    const markerIndex = Number(currentMarker.dataset.chapterIndex)
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
    state.chapterContentCache.value = {}
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
