import { readerApi } from '@/api/reader'
import type { ApiResponse } from '@/api/http/types'
import type { Chapter } from '@/types/book'
import { isNexusError } from '@/utils/errors'
import { formatReaderContent, type ReaderBook, buildReaderContentBookId } from '@/stores/reader/helpers'
import {
  normalizeContentPayload,
  normalizeReaderBookPayload,
  type StageReport,
} from './content-normalizers'

// ─── Cache ──────────────────────────────────────────────────────────

export class LRUStringCache {
  private map = new Map<string, string>()
  private max: number

  constructor(max: number) {
    this.max = max
  }

  get(key: string): string | undefined {
    const value = this.map.get(key)
    if (value !== undefined) {
      // Move to end (most recently used)
      this.map.delete(key)
      this.map.set(key, value)
    }
    return value
  }

  set(key: string, value: string): void {
    this.map.delete(key)
    this.map.set(key, value)
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value
      if (oldest === undefined) {
        break
      }
      this.map.delete(oldest)
    }
  }
}

// ─── Content Service ────────────────────────────────────────────────

export function createReaderContentService() {
  const chapterContentCache = new LRUStringCache(60)
  const formattedContentCache = new LRUStringCache(30)
  const inflightChapterContentRequests = new Map<string, Promise<string>>()
  const FORMATTED_CACHE_HASH_KEY_PREFIX = 'fmt:'
  let currentSourceId = ''
  let currentBookUrl = ''

  const hashText = (value: string) => {
    let hash = 2166136261
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index)
      hash = Math.imul(hash, 16777619)
    }
    return (hash >>> 0).toString(36)
  }

  const chapterCacheKey = (chapterUrl: string) => {
    return currentSourceId && currentBookUrl
      ? `${currentSourceId}::${currentBookUrl}::${chapterUrl}`
      : chapterUrl
  }

  const chapterRequestCacheKey = (
    chapter: Chapter,
    book: { bookUrl: string }
  ) => `${book.bookUrl}::${chapter.url}`

  const setCurrentBook = (sourceId: string, bookUrl: string) => {
    currentSourceId = sourceId
    currentBookUrl = bookUrl
  }

  const cacheChapterContent = (chapterUrl: string, chapterContent: string) => {
    const key = chapterCacheKey(chapterUrl)
    chapterContentCache.set(key, chapterContent)
  }

  const getCachedChapterContent = (chapterUrl: string): string | undefined => {
    const key = chapterCacheKey(chapterUrl)
    return chapterContentCache.get(key)
  }

  const cacheFormattedContent = (chapterContent: string, formatted: string) => {
    const key = `${FORMATTED_CACHE_HASH_KEY_PREFIX}${chapterContent.length}:${hashText(chapterContent)}`
    formattedContentCache.set(key, formatted)
  }

  const getFormattedContent = (chapterContent: string): string | undefined => {
    const key = `${FORMATTED_CACHE_HASH_KEY_PREFIX}${chapterContent.length}:${hashText(chapterContent)}`
    return formattedContentCache.get(key)
  }

  const formatChapterContent = (chapterContent: string): string => {
    const cached = getFormattedContent(chapterContent)
    if (cached !== undefined) {
      return cached
    }

    const formatted = formatReaderContent(chapterContent)
    cacheFormattedContent(chapterContent, formatted)
    return formatted
  }

  const summarizeStageFailure = (details?: string): string | null => {
    if (!details) {
      return null
    }

    try {
      const parsed = JSON.parse(details) as {
        failureCode?: string
        stageReports?: Array<{ stage?: string; ok?: boolean; failureCode?: string }>
      }
      const stage =
        parsed.stageReports?.find(
          item =>
            item?.ok === false &&
            (typeof item?.stage === 'string' || typeof item?.failureCode === 'string')
        ) ||
        parsed.stageReports?.find(item => typeof item?.failureCode === 'string') ||
        parsed.stageReports?.find(item => typeof item?.stage === 'string')
      const parts = [
        stage?.stage ? `阶段: ${stage.stage}` : null,
        stage?.failureCode || parsed.failureCode
          ? `代码: ${stage?.failureCode || parsed.failureCode}`
          : null,
      ].filter(Boolean)

      return parts.length > 0 ? parts.join(' · ') : null
    } catch {
      return null
    }
  }

  const fetchBookInfo = async (
    sourceId: string,
    bookUrl: string
  ): Promise<ApiResponse<ReaderBook>> => {
    const response = await readerApi.getBookInfo(sourceId, bookUrl)

    if (!response.isSuccess || !response.data) {
      return response as ApiResponse<ReaderBook>
    }

    return {
      ...response,
      data: {
        ...response.data,
        ...normalizeReaderBookPayload(response.data),
        sourceId,
        bookUrl,
      },
    }
  }

  const fetchChapterContent = async (
    chapter: Chapter,
    book: ReaderBook,
    options?: {
      requestId?: string
      loadErrorDetailsRef?: { value: string | null }
      contentStageReportsRef?: { value: StageReport[] }
      onContentFetched?: (chapterUrl: string, content: string) => void
    }
  ): Promise<string> => {
    const cached = getCachedChapterContent(chapter.url)
    if (cached !== undefined) {
      return cached
    }

    const requestCacheKey = chapterRequestCacheKey(chapter, book)
    const inflightRequest = inflightChapterContentRequests.get(requestCacheKey)
    if (inflightRequest) {
      return await inflightRequest
    }

    const request = (async () => {
      if (options?.loadErrorDetailsRef) {
        options.loadErrorDetailsRef.value = null
      }

      const res = await readerApi.getContent(book.sourceId, chapter.url, {
        bookUrl: book.bookUrl,
        bookId: buildReaderContentBookId(book),
        index: chapter.index,
        requestId: options?.requestId,
      })

      if (!res.isSuccess) {
        throw new Error(res.errorMsg || '获取正文失败')
      }

      const normalizedContent = normalizeContentPayload(res.data)
      const chapterContent = normalizedContent.content || ''

      if (options?.contentStageReportsRef) {
        options.contentStageReportsRef.value = normalizedContent.stageReports as any
      }

      if (!chapterContent.trim()) {
        const failureCode =
          normalizedContent.stageReports.find(report => report.ok === false)?.failureCode || null
        if (options?.loadErrorDetailsRef) {
          options.loadErrorDetailsRef.value = failureCode
        }
        throw new Error('章节内容为空，请重试或切换书源')
      }

      if (options?.loadErrorDetailsRef) {
        options.loadErrorDetailsRef.value = null
      }

      cacheChapterContent(chapter.url, chapterContent)
      options?.onContentFetched?.(chapter.url, chapterContent)

      return chapterContent
    })().catch(error => {
      if (isNexusError(error)) {
        const stageSummary = summarizeStageFailure(error.details)
        if (options?.loadErrorDetailsRef) {
          options.loadErrorDetailsRef.value = stageSummary
        }
        const message = stageSummary ? `${error.message} (${stageSummary})` : error.message
        throw new Error(message)
      }

      throw error
    })

    inflightChapterContentRequests.set(requestCacheKey, request)

    try {
      return await request
    } finally {
      inflightChapterContentRequests.delete(requestCacheKey)
    }
  }

  return {
    setCurrentBook,
    cacheChapterContent,
    getCachedChapterContent,
    formatChapterContent,
    fetchBookInfo,
    fetchChapterContent,
    summarizeStageFailure,
  }
}

// ─── Re-export normalization helpers for backwards compat ───────────

export { normalizeCatalogPayload, normalizeReaderBookPayload } from './content-normalizers'
export type { StageReport } from './content-normalizers'