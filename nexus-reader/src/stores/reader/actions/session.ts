import type { ApiResponse } from '@/api/http/types'
import type { Chapter } from '@/types/book'
import { progressApi } from '@/api/progress'
import { resolveInitialChapterIndex, type ReaderBook } from '@/utils/readerStore'
import { buildReaderContentBookId, savePersistedReaderProgress } from '@/utils/readerStore'
import type { ReaderStoreState, ReaderTarget } from '../types'

interface ReaderSessionHelpers {
  fetchBookInfo: (sourceId: string, bookUrl: string) => Promise<ApiResponse<ReaderBook>>
  isCurrentBookTarget: (target: ReaderTarget) => boolean
  hasActiveSession: (target: ReaderTarget) => boolean
  ensureCatalog: () => Promise<Chapter[]>
  loadChapterAt: (index: number, options?: { replaceLoaded?: boolean }) => Promise<void>
}

export function createReaderSessionActions(state: ReaderStoreState, helpers: ReaderSessionHelpers) {
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
      resetBookSession()

      await helpers.ensureCatalog()

      // Cloud resume (best-effort). If it fails or user is not logged in, fall back to local.
      const cloudBookId = buildReaderContentBookId(book)
      let cloudIndex: number | undefined
      let cloudScrollPercent: number | undefined
      let cloudScrollKind: 'chapter' | 'document' = 'document'
      if (typeof window !== 'undefined') {
        try {
          const cloud = await progressApi.get(cloudBookId)
          if (cloud.isSuccess && cloud.data && typeof cloud.data.chapterIndex === 'number') {
            cloudIndex = Math.max(0, Math.trunc(cloud.data.chapterIndex))
          }
          if (cloud.isSuccess && cloud.data?.scrollKind === 'chapter') {
            cloudScrollKind = 'chapter'
          }
          if (cloud.isSuccess && cloud.data && typeof cloud.data.scrollPercent === 'number') {
            const value = cloud.data.scrollPercent
            if (Number.isFinite(value)) {
              cloudScrollPercent = Math.max(0, Math.min(100, value))
            }
          }
        } catch {
          // ignore cloud progress failures
        }
      }

      if (typeof cloudIndex === 'number') {
        state.progressMap.value = {
          ...state.progressMap.value,
          [book.bookUrl]: cloudIndex,
        }
        savePersistedReaderProgress(state.progressMap.value)
      }

      const initialIndex = resolveInitialChapterIndex({
        catalogLength: state.catalog.value.length,
        persistedIndex: state.progressMap.value[book.bookUrl],
        bookLastChapterIndex: book.lastChapterIndex,
        bookDurChapterIndex: book.durChapterIndex,
      })

      await helpers.loadChapterAt(initialIndex, { replaceLoaded: true })

      // Defer applying scroll resume until DOM content is ready. The scroll sync composable will consume it.
      if (
        cloudScrollKind === 'chapter' &&
        typeof cloudScrollPercent === 'number' &&
        typeof cloudIndex === 'number'
      ) {
        state.resumeScrollPercent.value = cloudScrollPercent
        state.resumeScrollChapterIndex.value = initialIndex
      }
    } catch (err) {
      state.error.value = err instanceof Error ? err.message : '打开书籍失败'
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
  }

  return {
    ensureReaderSession,
    startReaderSession,
    openBook,
  }
}
