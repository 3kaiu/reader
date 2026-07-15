import type { ApiResponse } from '@/api/http/types'
import type { Chapter } from '@/types/book'
import { resolveInitialChapterIndex, type ReaderBook } from '@/stores/reader/helpers'
import {
  loadPersistedReaderProgressMeta,
  savePersistedReaderProgressMeta,
} from '@/stores/reader/helpers'
import type { ReaderStoreState, ReaderTarget } from '../types'

interface ReaderSessionHelpers {
  fetchBookInfo: (sourceId: string, bookUrl: string) => Promise<ApiResponse<ReaderBook>>
  isCurrentBookTarget: (target: ReaderTarget) => boolean
  hasActiveSession: (target: ReaderTarget) => boolean
  ensureCatalog: () => Promise<Chapter[]>
  loadChapterAt: (index: number, options?: { replaceLoaded?: boolean }) => Promise<void>
  setCurrentBook: (sourceId: string, bookUrl: string) => void
}

export function createReaderSessionActions(state: ReaderStoreState, helpers: ReaderSessionHelpers) {
  // Concurrency guard: prevent multiple simultaneous startReaderSession calls
  let sessionInflight: Promise<ApiResponse<ReaderBook>> | null = null

  const resetBookSession = () => {
    state.catalog.value = []
    state.loadedChapters.value = []
    state.chapterContentCache.value = {}
    state.contentStageReports.value = []
    state.loadErrorDetails.value = null
  }

  const openBook = async (book: ReaderBook) => {
    state.isLoading.value = true
    state.error.value = null
    state.loadError.value = null
    state.loadErrorDetails.value = null

    try {
      state.currentBook.value = {
        ...book,
        sourceId: book.sourceId,
        bookUrl: book.bookUrl,
      }
      helpers.setCurrentBook(book.sourceId, book.bookUrl)
      resetBookSession()

      await helpers.ensureCatalog()

      // Migration / safety: if we have a local persisted chapter index but no meta timestamp yet,
      // treat local as "new" once so older cloud state won't overwrite it on first open after upgrade.
      const existingLocalIndex = state.progressMap.value[book.bookUrl]
      if (typeof existingLocalIndex === 'number' && Number.isFinite(existingLocalIndex)) {
        const meta = loadPersistedReaderProgressMeta()
        if (!meta[book.bookUrl]) {
          meta[book.bookUrl] = {
            index: Math.max(0, Math.trunc(existingLocalIndex)),
            updatedAt: Date.now(),
          }
          savePersistedReaderProgressMeta(meta)
        }
      }

      const initialIndex = resolveInitialChapterIndex({
        catalogLength: state.catalog.value.length,
        persistedIndex: state.progressMap.value[book.bookUrl],
        bookLastChapterIndex: book.lastChapterIndex,
        bookDurChapterIndex: book.durChapterIndex,
      })

      await helpers.loadChapterAt(initialIndex, { replaceLoaded: true })
    } catch (err) {
      state.error.value = err instanceof Error ? err.message : '打开书籍失败'
      state.loadError.value = state.error.value
      throw err
    } finally {
      state.isLoading.value = false
    }
  }

  const ensureReaderSession = async (book: ReaderBook) => {
    if (helpers.hasActiveSession(book) && state.currentBook.value) {
      return state.currentBook.value
    }

    await openBook(book)
    return state.currentBook.value || book
  }

  const startReaderSession = async (
    sourceId: string,
    bookUrl: string
  ): Promise<ApiResponse<ReaderBook>> => {
    const target = { sourceId, bookUrl }

    if (helpers.hasActiveSession(target) && state.currentBook.value) {
      return {
        isSuccess: true,
        data: state.currentBook.value,
      }
    }

    // Return existing promise if a session start is already in progress
    if (sessionInflight) {
      return sessionInflight
    }

    sessionInflight = (async () => {
      try {
        if (helpers.isCurrentBookTarget(target) && state.currentBook.value) {
          const book = await ensureReaderSession(state.currentBook.value)
          return {
            isSuccess: true,
            data: book,
          }
        }

        const response = await helpers.fetchBookInfo(sourceId, bookUrl)

        if (!response.isSuccess || !response.data) {
          const message = response.errorMsg || '获取书籍信息失败'
          state.error.value = message
          state.loadError.value = message
          state.loadErrorDetails.value = null
          state.isLoading.value = false
          return response
        }

        const book = await ensureReaderSession(response.data)
        return {
          ...response,
          data: book,
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : '启动阅读器会话失败'
        state.error.value = message
        state.loadError.value = message
        state.isLoading.value = false
        return { isSuccess: false, errorMsg: message, data: undefined as unknown as ReaderBook }
      } finally {
        sessionInflight = null
      }
    })()

    return sessionInflight
  }

  return {
    ensureReaderSession,
    startReaderSession,
    openBook,
  }
}
