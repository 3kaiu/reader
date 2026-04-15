import { createReaderChapterOperations } from './actions/chapter-operations'
import { createReaderActionHelpers } from './actions/helpers'
import { createReaderNavigationActions } from './actions/navigation'
import { createReaderProgressHandlers } from './actions/progress'
import { createReaderSessionActions } from './actions/session'
import type { ReaderStoreState, ReaderStoreView } from './types'

export function createReaderStoreActions(state: ReaderStoreState, view: ReaderStoreView) {
  const helpers = createReaderActionHelpers(state)

  const { appendNextChapter, retryLoadNext, refreshChapter, reloadCurrentChapter } =
    createReaderChapterOperations(state, view, {
      fetchChapterContent: helpers.fetchChapterContent,
      prefetchChapterContent: helpers.prefetchChapterContent,
      setCurrentChapterContent: helpers.setCurrentChapterContent,
      updateLoadedChapter: helpers.updateLoadedChapter,
    })

  const {
    syncCurrentChapterByIndex,
    updateChapterIndexByScroll,
    saveProgress,
    reset,
    disposeReader,
  } = createReaderProgressHandlers(state)

  const { ensureReaderSession, startReaderSession, openBook } = createReaderSessionActions(state, {
    fetchBookInfo: helpers.fetchBookInfo,
    isCurrentBookTarget: helpers.isCurrentBookTarget,
    hasActiveSession: helpers.hasActiveSession,
    ensureCatalog: helpers.ensureCatalog,
    loadChapterAt: helpers.loadChapterAt,
  })

  const { goToChapter, goToChapterInScroll, nextChapter, prevChapter } =
    createReaderNavigationActions(state, view, {
      loadChapterAt: helpers.loadChapterAt,
    })

  return {
    appendNextChapter,
    disposeReader,
    ensureReaderSession,
    fetchBookInfo: helpers.fetchBookInfo,
    goToChapter,
    goToChapterInScroll,
    isCurrentBookTarget: helpers.isCurrentBookTarget,
    nextChapter,
    openBook,
    prevChapter,
    refreshChapter,
    reloadCurrentChapter,
    reset,
    retryLoadNext,
    saveProgress,
    syncCurrentChapterByIndex,
    startReaderSession,
    updateChapterIndexByScroll,
  }
}
