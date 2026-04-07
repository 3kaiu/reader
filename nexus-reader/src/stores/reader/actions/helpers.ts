import type { ApiResponse } from '@/api/http/types'
import { readerApi } from '@/api/reader'
import type { Chapter } from '@/types/book'
import { isNexusError } from '@/utils/errors'
import { isSameReaderRouteTarget } from '@/utils/readerRoute'
import {
  buildReaderContentBookId,
  createLoadedChapter,
  formatReaderContent,
  mergeLoadedChapters,
  normalizeReaderCatalog,
  type ReaderBook,
} from '@/utils/readerStore'
import type { ReaderStoreState, ReaderTarget } from '../types'

function parseChapterCatalogPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    const candidates = [record.chapters, record.items, record.data]
    const arrayCandidate = candidates.find(Array.isArray)
    if (arrayCandidate) {
      return arrayCandidate as unknown[]
    }
  }

  return []
}

function toCatalogChapter(entry: unknown, index: number): Chapter | null {
  if (!entry || typeof entry !== 'object') {
    return null
  }

  const record = entry as Record<string, unknown>
  const urlCandidate = [record.url, record.chapterUrl, record.chapter_url].find(
    value => typeof value === 'string',
  )
  const url = typeof urlCandidate === 'string' ? urlCandidate.trim() : ''
  if (!url) {
    return null
  }

  const titleCandidate = [record.title, record.name, record.chapterTitle, record.chapter_title].find(
    value => typeof value === 'string' && value.trim(),
  )
  const title =
    typeof titleCandidate === 'string' ? titleCandidate.trim() : `第${index + 1}章`

  const normalizedIndex =
    typeof record.index === 'number' && Number.isFinite(record.index)
      ? record.index
      : typeof record.chapterIndex === 'number' && Number.isFinite(record.chapterIndex)
        ? record.chapterIndex
        : typeof record.chapter_index === 'number' && Number.isFinite(record.chapter_index)
          ? record.chapter_index
      : index

  return {
    title,
    url,
    index: normalizedIndex,
    ...(typeof record.isVip === 'boolean' ? { isVip: record.isVip } : {}),
  }
}

function normalizeCatalogPayload(payload: unknown): Chapter[] {
  return parseChapterCatalogPayload(payload)
    .map((entry, index) => toCatalogChapter(entry, index))
    .filter((chapter): chapter is Chapter => chapter !== null)
}

function toOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normalizeReaderBookPayload(payload: unknown): Partial<ReaderBook> {
  if (!payload || typeof payload !== 'object') {
    return {}
  }

  const record = payload as Record<string, unknown>
  const name = typeof record.name === 'string' ? record.name : undefined
  const author = typeof record.author === 'string' ? record.author : undefined
  const coverUrl =
    typeof record.coverUrl === 'string'
      ? record.coverUrl
      : typeof record.cover_url === 'string'
        ? record.cover_url
        : undefined
  const intro = typeof record.intro === 'string' ? record.intro : undefined
  const durChapterIndex =
    toOptionalNumber(record.durChapterIndex) ?? toOptionalNumber(record.dur_chapter_index)
  const lastChapterIndex =
    toOptionalNumber(record.lastChapterIndex) ?? toOptionalNumber(record.last_chapter_index)

  return {
    ...(name ? { name } : {}),
    ...(author ? { author } : {}),
    ...(coverUrl ? { coverUrl } : {}),
    ...(intro ? { intro } : {}),
    ...(typeof durChapterIndex === 'number' ? { durChapterIndex } : {}),
    ...(typeof lastChapterIndex === 'number' ? { lastChapterIndex } : {}),
  }
}

export function createReaderActionHelpers(state: ReaderStoreState) {
  const inflightChapterContentRequests = new Map<string, Promise<string>>()

  const cacheChapterContent = (chapterUrl: string, chapterContent: string) => {
    state.chapterContentCache.value = {
      ...state.chapterContentCache.value,
      [chapterUrl]: chapterContent,
    }
  }

  const getCachedChapterContent = (chapterUrl: string) =>
    state.chapterContentCache.value[chapterUrl]

  const getChapterRequestCacheKey = (
    chapter: Chapter,
    book: ReaderBook | null = state.currentBook.value,
  ) => `${book?.bookUrl || ''}::${chapter.url}`

  const summarizeStageFailure = (details?: string): string | null => {
    if (!details) {
      return null
    }

    try {
      const parsed = JSON.parse(details) as {
        failureCode?: string
        stageReports?: Array<{ stage?: string; failureCode?: string }>
      }
      const stage = parsed.stageReports?.find(item => typeof item?.stage === 'string')
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
    bookUrl: string,
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

  const isCurrentBookTarget = (target: ReaderTarget) =>
    Boolean(
      state.currentBook.value &&
        isSameReaderRouteTarget(state.currentBook.value, target),
    )

  const hasActiveSession = (target: ReaderTarget) =>
    isCurrentBookTarget(target) &&
    state.catalog.value.length > 0 &&
    state.currentChapter.value !== null

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
    )

    if (!res.isSuccess) {
      throw new Error(res.errorMsg || '获取目录失败')
    }

    const normalizedCatalog = normalizeReaderCatalog(
      normalizeCatalogPayload(res.data),
    )
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
    state.formattedContent.value = formatReaderContent(chapterContent)
    state.isParsing.value = false
  }

  const updateLoadedChapter = (
    chapter: Chapter,
    chapterContent: string,
    replaceOnly = false,
  ) => {
    state.loadedChapters.value = mergeLoadedChapters(
      state.loadedChapters.value,
      createLoadedChapter(chapter, chapterContent),
      replaceOnly,
    )
  }

  const fetchChapterContent = async (chapter: Chapter): Promise<string> => {
    const cached = getCachedChapterContent(chapter.url)
    if (typeof cached === 'string') {
      return cached
    }

    const currentBook = state.currentBook.value
    if (!currentBook) {
      throw new Error('缺少书籍信息')
    }

    const requestCacheKey = getChapterRequestCacheKey(chapter, currentBook)
    const inflightRequest = inflightChapterContentRequests.get(requestCacheKey)
    if (inflightRequest) {
      return await inflightRequest
    }

    const request = (async () => {
      state.loadErrorDetails.value = null
      const res = await readerApi.getContent(
        currentBook.sourceId,
        chapter.url,
        {
          bookUrl: currentBook.bookUrl,
          bookId: buildReaderContentBookId(currentBook),
          index: chapter.index,
        },
      )

      if (!res.isSuccess) {
        throw new Error(res.errorMsg || '获取正文失败')
      }

      const chapterContent = res.data?.content || ''
      state.contentStageReports.value = res.data?.meta?.stageReports ?? []
      if (!chapterContent.trim()) {
        state.loadErrorDetails.value =
          state.contentStageReports.value
            .find(report => report.ok === false)?.failureCode || null
        throw new Error('章节内容为空，请重试或切换书源')
      }
      state.loadErrorDetails.value = null
      if (
        state.currentBook.value?.sourceId === currentBook.sourceId &&
        state.currentBook.value?.bookUrl === currentBook.bookUrl
      ) {
        cacheChapterContent(chapter.url, chapterContent)
      }
      return chapterContent
    })().catch(error => {
      if (isNexusError(error)) {
        const stageSummary = summarizeStageFailure(error.details)
        state.loadErrorDetails.value = stageSummary
        const message = stageSummary
          ? `${error.message} (${stageSummary})`
          : error.message
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

  const prefetchChapterContent = (chapter: Chapter | undefined) => {
    if (!chapter || !state.currentBook.value) {
      return
    }

    if (typeof getCachedChapterContent(chapter.url) === 'string') {
      return
    }

    const requestCacheKey = getChapterRequestCacheKey(chapter)
    if (inflightChapterContentRequests.has(requestCacheKey)) {
      return
    }

    void fetchChapterContent(chapter).catch(() => undefined)
  }

  const loadChapterAt = async (
    index: number,
    options: { replaceLoaded?: boolean } = {},
  ) => {
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
  }
}
