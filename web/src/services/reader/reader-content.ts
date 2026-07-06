import { readerApi } from '@/api/reader'
import type { ApiResponse } from '@/api/http/types'
import type { Chapter } from '@/types/book'
import { isNexusError } from '@/utils/errors'
import { formatReaderContent, type ReaderBook, buildReaderContentBookId } from '@/utils/readerStore'

// Re-use the content stage report type from the type definition
export type StageReport = {
  stage: string
  ok: boolean
  failureCode?: string
  warnings?: string[]
  metrics?: Record<string, string>
}

// ─── Content normalization ──────────────────────────────────────────

function tryParseJsonPayload(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return value
  }

  if (
    !(trimmed.startsWith('{') && trimmed.endsWith('}')) &&
    !(trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    return value
  }

  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return value
  }
}

function parseChapterCatalogPayload(payload: unknown): unknown[] {
  const normalizedPayload = tryParseJsonPayload(payload)
  if (Array.isArray(normalizedPayload)) {
    return normalizedPayload
  }

  if (normalizedPayload && typeof normalizedPayload === 'object') {
    const queue: unknown[] = [normalizedPayload]
    const visited = new Set<unknown>()
    const containerKeys = [
      'chapters',
      'items',
      'data',
      'list',
      'results',
      'chapterList',
      'chapter_list',
    ]

    while (queue.length > 0) {
      const current = queue.shift()
      if (!current || typeof current !== 'object' || visited.has(current)) {
        continue
      }
      visited.add(current)

      const record = current as Record<string, unknown>
      for (const key of containerKeys) {
        const candidate = tryParseJsonPayload(record[key])
        if (Array.isArray(candidate)) {
          return candidate as unknown[]
        }
        if (candidate && typeof candidate === 'object') {
          queue.push(candidate)
        }
      }
    }
  }

  return []
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function pickFirstString(values: unknown[]): string | undefined {
  for (const value of values) {
    const normalized = toOptionalString(value)
    if (normalized) {
      return normalized
    }
  }
  return undefined
}

function toOptionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {
      return undefined
    }
    const parsed = Number(trimmed)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return undefined
}

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    if (value === 1) {
      return true
    }
    if (value === 0) {
      return false
    }
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (
      normalized === 'true' ||
      normalized === '1' ||
      normalized === 'yes' ||
      normalized === 'y' ||
      normalized === 'on'
    ) {
      return true
    }
    if (
      normalized === 'false' ||
      normalized === '0' ||
      normalized === 'no' ||
      normalized === 'n' ||
      normalized === 'off'
    ) {
      return false
    }
  }

  return undefined
}

function toCatalogChapter(entry: unknown, index: number): Chapter | null {
  if (!entry || typeof entry !== 'object') {
    return null
  }

  const record = entry as Record<string, unknown>
  const url = pickFirstString([
    record.url,
    record.chapterUrl,
    record.chapter_url,
    record.chapterHref,
    record.chapter_href,
    record.link,
    record.href,
    record.chapterLink,
    record.chapter_link,
  ])
  if (!url) {
    return null
  }

  const titleCandidate = pickFirstString([
    record.title,
    record.name,
    record.chapterTitle,
    record.chapter_title,
    record.chapterName,
    record.chapter_name,
  ])
  const title = titleCandidate || `第${index + 1}章`

  const normalizedIndex =
    toOptionalNumber(record.index) ??
    toOptionalNumber(record.chapterIndex) ??
    toOptionalNumber(record.chapter_index) ??
    index
  const normalizedIsVip =
    toOptionalBoolean(record.isVip) ??
    toOptionalBoolean(record.is_vip) ??
    toOptionalBoolean(record.vip) ??
    toOptionalBoolean(record.isPaid) ??
    toOptionalBoolean(record.is_paid)

  return {
    title,
    url,
    index: normalizedIndex,
    ...(typeof normalizedIsVip === 'boolean' ? { isVip: normalizedIsVip } : {}),
  }
}

function normalizeCatalogPayload(payload: unknown): Chapter[] {
  return parseChapterCatalogPayload(payload)
    .map((entry, index) => toCatalogChapter(entry, index))
    .filter((chapter): chapter is Chapter => chapter !== null)
}

function resolveBookPayloadRecords(payload: unknown): Record<string, unknown>[] {
  const normalizedPayload = tryParseJsonPayload(payload)
  if (!normalizedPayload || typeof normalizedPayload !== 'object') {
    return []
  }

  const root = normalizedPayload as Record<string, unknown>
  const nested = [root.book, root.bookInfo, root.book_info, root.data, root.item, root.detail]
    .map(value => tryParseJsonPayload(value))
    .filter(value => value && typeof value === 'object') as Record<string, unknown>[]

  return [...nested, root]
}

function pickBookField<T>(
  records: Record<string, unknown>[],
  selector: (record: Record<string, unknown>) => T | undefined
): T | undefined {
  for (const record of records) {
    const value = selector(record)
    if (typeof value !== 'undefined') {
      return value
    }
  }
  return undefined
}

function normalizeReaderBookPayload(payload: unknown): Partial<ReaderBook> {
  const records = resolveBookPayloadRecords(payload)
  if (records.length === 0) {
    return {}
  }

  const name = pickBookField(records, record =>
    pickFirstString([record.name, record.title, record.bookName, record.book_name])
  )
  const author = pickBookField(records, record =>
    pickFirstString([record.author, record.writer, record.authorName, record.author_name])
  )
  const coverUrl = pickBookField(records, record =>
    pickFirstString([record.coverUrl, record.cover_url, record.cover, record.img, record.image])
  )
  const intro = pickBookField(records, record =>
    pickFirstString([
      record.intro,
      record.description,
      record.desc,
      record.summary,
      record.bookIntro,
      record.book_intro,
    ])
  )
  const durChapterIndex = pickBookField(
    records,
    record => toOptionalNumber(record.durChapterIndex) ?? toOptionalNumber(record.dur_chapter_index)
  )
  const lastChapterIndex = pickBookField(
    records,
    record =>
      toOptionalNumber(record.lastChapterIndex) ?? toOptionalNumber(record.last_chapter_index)
  )

  const root = records[records.length - 1]

  return {
    ...(name ? { name } : {}),
    ...(author ? { author } : {}),
    ...(coverUrl ? { coverUrl } : {}),
    ...(intro ? { intro } : {}),
    ...(typeof durChapterIndex === 'number' ? { durChapterIndex } : {}),
    ...(typeof lastChapterIndex === 'number' ? { lastChapterIndex } : {}),
    ...(toOptionalString(root.sourceId) ? { sourceId: toOptionalString(root.sourceId) } : {}),
    ...(toOptionalString(root.source_id) ? { sourceId: toOptionalString(root.source_id) } : {}),
    ...(toOptionalString(root.bookUrl) ? { bookUrl: toOptionalString(root.bookUrl) } : {}),
    ...(toOptionalString(root.book_url) ? { bookUrl: toOptionalString(root.book_url) } : {}),
  }
}

export type NormalizedContentResult = {
  content: string
  packageId?: string | null
  stageReports: StageReport[]
}

function normalizeStageReports(value: unknown): StageReport[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map(item => {
      if (!item || typeof item !== 'object') {
        return null
      }

      const record = item as Record<string, unknown>
      const stage = toOptionalString(record.stage)
      const failureCode =
        toOptionalString(record.failureCode) ?? toOptionalString(record.failure_code)
      const ok = toOptionalBoolean(record.ok)

      if (!stage && !failureCode) {
        return null
      }

      const warningsValue = tryParseJsonPayload(record.warnings)
      const warnings = Array.isArray(warningsValue)
        ? (warningsValue as unknown[])
            .map(entry => toOptionalString(entry))
            .filter((entry): entry is string => Boolean(entry))
        : undefined

      const metricsValue = tryParseJsonPayload(record.metrics)
      const metrics =
        metricsValue && typeof metricsValue === 'object'
          ? Object.fromEntries(
              Object.entries(metricsValue as Record<string, unknown>)
                .map(([key, raw]) => [key, toOptionalString(raw)])
                .filter(([, raw]) => Boolean(raw))
            )
          : undefined

      return {
        stage: stage || 'unknown',
        ok: typeof ok === 'boolean' ? ok : failureCode ? false : true,
        ...(failureCode ? { failureCode } : {}),
        ...(warnings && warnings.length > 0 ? { warnings } : {}),
        ...(metrics && Object.keys(metrics).length > 0 ? { metrics } : {}),
      }
    })
    .filter(
      (report): report is StageReport => report !== null
    )
}

export function normalizeContentPayload(payload: unknown): NormalizedContentResult {
  const normalizedPayload = tryParseJsonPayload(payload)

  if (typeof normalizedPayload === 'string') {
    return {
      content: normalizedPayload,
      stageReports: [],
    }
  }

  if (!normalizedPayload || typeof normalizedPayload !== 'object') {
    return {
      content: '',
      stageReports: [],
    }
  }

  const record = normalizedPayload as Record<string, unknown>
  const contentValue = tryParseJsonPayload(record.content)
  const chunksValue = tryParseJsonPayload(record.chunks)
  const chunksContent = Array.isArray(chunksValue)
    ? (chunksValue as unknown[])
        .map(item => (typeof item === 'string' ? item : ''))
        .filter(item => item.length > 0)
        .join('\n')
    : ''
  const content =
    typeof contentValue === 'string'
      ? contentValue
      : typeof record.text === 'string'
        ? record.text
        : chunksContent
  const metaValue = tryParseJsonPayload(record.meta)
  const packageId =
    metaValue && typeof metaValue === 'object'
      ? (toOptionalString((metaValue as Record<string, unknown>).packageId) ??
          toOptionalString((metaValue as Record<string, unknown>).package_id) ??
          null)
      : null
  const stageReportsValue =
    metaValue && typeof metaValue === 'object'
      ? tryParseJsonPayload(
          (metaValue as Record<string, unknown>).stageReports ??
            (metaValue as Record<string, unknown>).stage_reports
        )
      : undefined
  const stageReportsFallback = tryParseJsonPayload(record.stageReports)
  const stageReportsSnake = tryParseJsonPayload(record.stage_reports)
  const stageReports = normalizeStageReports(
    stageReportsValue ?? stageReportsFallback ?? stageReportsSnake
  )

  return {
    content,
    packageId,
    stageReports,
  }
}

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

export { normalizeCatalogPayload, normalizeReaderBookPayload }