import { triggerRef } from 'vue'
import type { ApiResponse } from '@/api/http/types'
import { readerApi } from '@/api/reader'
import type { Chapter } from '@/types/book'
import { isSameReaderRouteTarget } from '@/utils/readerRoute'
import {
  createLoadedChapter,
  mergeLoadedChapters,
  normalizeReaderCatalog,
  type ReaderBook,
} from '@/stores/reader/helpers'
import type { ReaderStoreState, ReaderTarget } from '../types'
import {
  createReaderContentService,
  normalizeCatalogPayload,
} from '@/services/reader/reader-content'
import { createReaderPrefetchService } from '@/services/reader/reader-prefetch'

// Module-level service instances — lazily created once per module lifecycle.
// In tests, reset them via resetReaderServices() between test runs.
let contentService: ReturnType<typeof createReaderContentService> | null = null
let prefetchService: ReturnType<typeof createReaderPrefetchService> | null = null

export function resetReaderServices() {
  contentService = null
  prefetchService = null
}

function getContentService() {
  if (!contentService) {
    contentService = createReaderContentService()
  }
  return contentService
}

function getPrefetchService() {
  const svc = getContentService()
  if (!prefetchService) {
    prefetchService = createReaderPrefetchService({
      getCachedChapterContent: (url: string) => svc.getCachedChapterContent(url),
      cacheChapterContent: (url: string, content: string) => svc.cacheChapterContent(url, content),
      inflightFetch: async (chapter: Chapter, book: ReaderBook) => {
        return await svc.fetchChapterContent(chapter, book, {
          loadErrorDetailsRef: { value: null },
        })
      },
      inflightCancel: (_chapter: Chapter, _book: ReaderBook) => {
        // inflight requests are self-cleaning; no explicit cancel needed
      },
    })
  }
  return prefetchService
}

export function createReaderActionHelpers(state: ReaderStoreState) {
  const svc = getContentService()

  const setCurrentBook = (sourceId: string, bookUrl: string) => {
    svc.setCurrentBook(sourceId, bookUrl)
  }

  const isCurrentBookTarget = (target: ReaderTarget) =>
    Boolean(state.currentBook.value && isSameReaderRouteTarget(state.currentBook.value, target))

  const hasActiveSession = (target: ReaderTarget) =>
    isCurrentBookTarget(target) &&
    state.catalog.value.length > 0 &&
    state.currentChapter.value !== null

  const fetchBookInfo = async (
    sourceId: string,
    bookUrl: string
  ): Promise<ApiResponse<ReaderBook>> => {
    const requestId = crypto.randomUUID()
    state.diagnosticsRequestId.value = requestId
    return await svc.fetchBookInfo(sourceId, bookUrl)
  }

  const ensureCatalog = async () => {
    if (!state.currentBook.value) {
      throw new Error('缺少书籍信息')
    }

    if (state.catalog.value.length > 0) {
      return state.catalog.value
    }

    const res = await readerApi.getChapters(
      state.currentBook.value.sourceId,
      state.currentBook.value.bookUrl,
      state.diagnosticsRequestId.value || undefined
    )

    if (!res.isSuccess) {
      throw new Error(res.errorMsg || '获取目录失败')
    }

    const normalizedCatalog = normalizeReaderCatalog(normalizeCatalogPayload(res.data))
    if (normalizedCatalog.length === 0) {
      throw new Error('目录为空，暂无可读章节')
    }

    state.catalog.value = normalizedCatalog

    return state.catalog.value
  }

  const setCurrentChapterContent = (chapter: Chapter, chapterContent: string) => {
    state.currentChapter.value = chapter
    state.content.value = chapterContent
    state.isParsing.value = true
    state.formattedContent.value = svc.formatChapterContent(chapterContent)
    state.isParsing.value = false
  }

  const updateLoadedChapter = (chapter: Chapter, chapterContent: string, replaceOnly = false) => {
    const formattedContent =
      state.currentChapter.value?.url === chapter.url
        ? state.formattedContent.value
        : svc.formatChapterContent(chapterContent)

    state.loadedChapters.value = mergeLoadedChapters(
      state.loadedChapters.value,
      createLoadedChapter(chapter, chapterContent, { formattedContent }),
      replaceOnly
    )
  }

  const fetchChapterContent = async (chapter: Chapter): Promise<string> => {
    const book = state.currentBook.value
    if (!book) {
      throw new Error('缺少书籍信息')
    }

    return await svc.fetchChapterContent(chapter, book, {
      requestId: state.diagnosticsRequestId.value || undefined,
      loadErrorDetailsRef: state.loadErrorDetails,
      contentStageReportsRef: state.contentStageReports,
      onContentFetched: (_url: string, _content: string) => {
        triggerRef(state.chapterContentCache)
      },
    })
  }

  const prefetchChapterContent = (chapter: Chapter | undefined) => {
    const book = state.currentBook.value
    if (!chapter || !book) {
      return
    }

    getPrefetchService().prefetchChapterContent(chapter, book, state.catalog.value)
  }

  const loadChapterAt = async (index: number, options: { replaceLoaded?: boolean } = {}) => {
    const chapters = await ensureCatalog()
    const target = chapters[index]

    if (!target) {
      throw new Error('章节不存在')
    }

    const chapterContent = await fetchChapterContent(target)
    state.currentChapterIndex.value = index
    setCurrentChapterContent(target, chapterContent)
    updateLoadedChapter(target, chapterContent, options.replaceLoaded ?? true)
    prefetchChapterContent(chapters[index + 1])
    state.loadError.value = null
    state.loadErrorDetails.value = null
  }

  return {
    fetchBookInfo,
    isCurrentBookTarget,
    hasActiveSession,
    ensureCatalog,
    setCurrentChapterContent,
    updateLoadedChapter,
    fetchChapterContent,
    prefetchChapterContent,
    loadChapterAt,
    setCurrentBook,
  }
}
