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

type NormalizedContentPayload = {
  content: string
  packageId?: string | null
  stageReports: Array<{
    stage: string
    ok: boolean
    failureCode?: string
    warnings?: string[]
    metrics?: Record<string, string>
  }>
}

function normalizeStageReports(value: unknown): Array<{
  stage: string
  ok: boolean
  failureCode?: string
  warnings?: string[]
  metrics?: Record<string, string>
}> {
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
      (
        report
      ): report is {
        stage: string
        ok: boolean
        failureCode?: string
        warnings?: string[]
        metrics?: Record<string, string>
      } => report !== null
    )
}

function normalizeContentPayload(payload: unknown): NormalizedContentPayload {
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

export function createReaderActionHelpers(state: ReaderStoreState) {
  const inflightChapterContentRequests = new Map<string, Promise<string>>()
  const FORMATTED_CONTENT_CACHE_MAX_ENTRIES = 30
  const CHAPTER_CONTENT_CACHE_MAX_ENTRIES = 60
  const PREFETCH_IDLE_TIMEOUT_MS = 1200
  /** Align with server `max_batch_content_urls` default (128); keep small for prefetch UX. */
  const PREFETCH_BATCH_MAX = 4
  let chapterContentCacheRef = state.chapterContentCache.value
  let chapterContentCacheOrder = Object.keys(chapterContentCacheRef)
  const formattedContentCache = new Map<string, string>()
  const hashText = (value: string) => {
    let hash = 2166136261
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index)
      hash = Math.imul(hash, 16777619)
    }
    return (hash >>> 0).toString(36)
  }
  let prefetchIdleTaskId: number | ReturnType<typeof setTimeout> | null = null
  let prefetchAbortController: AbortController | null = null
  let prefetchTaskAbortController: AbortController | null = null

  const scheduleBackgroundTask = (
    callback: () => void,
    timeoutMs: number
  ): number | ReturnType<typeof setTimeout> => {
    const scheduler = (
      globalThis as {
        scheduler?: {
          postTask?: (
            callback: () => void,
            options: {
              priority: 'background'
              signal: AbortSignal
            }
          ) => Promise<unknown>
        }
      }
    ).scheduler
    if (scheduler?.postTask) {
      prefetchTaskAbortController = new AbortController()
      void scheduler
        .postTask(callback, {
          priority: 'background',
          signal: prefetchTaskAbortController.signal,
        })
        .catch(() => undefined)
      return -1
    }

    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      return window.requestIdleCallback(() => callback(), { timeout: timeoutMs })
    }

    return globalThis.setTimeout(callback, 120)
  }

  const syncChapterContentCacheOrder = () => {
    if (chapterContentCacheRef === state.chapterContentCache.value) {
      return
    }

    chapterContentCacheRef = state.chapterContentCache.value
    chapterContentCacheOrder = Object.keys(chapterContentCacheRef)
  }

  const touchChapterCacheEntry = (chapterUrl: string) => {
    const existingIndex = chapterContentCacheOrder.indexOf(chapterUrl)
    if (existingIndex >= 0) {
      chapterContentCacheOrder.splice(existingIndex, 1)
    }
    chapterContentCacheOrder.push(chapterUrl)
  }

  const cacheChapterContent = (chapterUrl: string, chapterContent: string) => {
    syncChapterContentCacheOrder()
    const cache = state.chapterContentCache.value

    cache[chapterUrl] = chapterContent
    touchChapterCacheEntry(chapterUrl)

    while (chapterContentCacheOrder.length > CHAPTER_CONTENT_CACHE_MAX_ENTRIES) {
      const evictedChapterUrl = chapterContentCacheOrder.shift()
      if (!evictedChapterUrl) {
        continue
      }
      delete cache[evictedChapterUrl]
    }
  }

  const getCachedChapterContent = (chapterUrl: string) => {
    syncChapterContentCacheOrder()
    const cached = state.chapterContentCache.value[chapterUrl]
    if (typeof cached === 'string') {
      touchChapterCacheEntry(chapterUrl)
    }
    return cached
  }

  const getChapterRequestCacheKey = (
    chapter: Chapter,
    book: ReaderBook | null = state.currentBook.value
  ) => `${book?.bookUrl || ''}::${chapter.url}`

  const formatChapterContent = (chapterContent: string) => {
    const cacheKey = `${chapterContent.length}:${hashText(chapterContent)}`
    const cached = formattedContentCache.get(cacheKey)
    if (typeof cached === 'string') {
      formattedContentCache.delete(cacheKey)
      formattedContentCache.set(cacheKey, cached)
      return cached
    }

    const formatted = formatReaderContent(chapterContent)
    formattedContentCache.set(cacheKey, formatted)
    while (formattedContentCache.size > FORMATTED_CONTENT_CACHE_MAX_ENTRIES) {
      const oldestKey = formattedContentCache.keys().next().value
      if (!oldestKey) {
        break
      }
      formattedContentCache.delete(oldestKey)
    }
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
    const requestId = crypto.randomUUID()
    state.diagnosticsRequestId.value = requestId
    const response = await readerApi.getBookInfo(sourceId, bookUrl, requestId)

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
    Boolean(state.currentBook.value && isSameReaderRouteTarget(state.currentBook.value, target))

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
    state.formattedContent.value = formatChapterContent(chapterContent)
    state.isParsing.value = false
  }

  const updateLoadedChapter = (chapter: Chapter, chapterContent: string, replaceOnly = false) => {
    const formattedContent =
      state.currentChapter.value?.url === chapter.url
        ? state.formattedContent.value
        : formatChapterContent(chapterContent)

    state.loadedChapters.value = mergeLoadedChapters(
      state.loadedChapters.value,
      createLoadedChapter(chapter, chapterContent, { formattedContent }),
      replaceOnly
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
      const res = await readerApi.getContent(currentBook.sourceId, chapter.url, {
        bookUrl: currentBook.bookUrl,
        bookId: buildReaderContentBookId(currentBook),
        index: chapter.index,
        requestId: state.diagnosticsRequestId.value || undefined,
      })

      if (!res.isSuccess) {
        throw new Error(res.errorMsg || '获取正文失败')
      }

      const normalizedContent = normalizeContentPayload(res.data)
      const chapterContent = normalizedContent.content || ''
      state.contentStageReports.value = normalizedContent.stageReports
      state.diagnosticsPackageId.value = normalizedContent.packageId ?? null
      if (!chapterContent.trim()) {
        state.loadErrorDetails.value =
          state.contentStageReports.value.find(report => report.ok === false)?.failureCode || null
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

  const prefetchChapterContent = (chapter: Chapter | undefined) => {
    if (!chapter || !state.currentBook.value) {
      return
    }

    if (prefetchAbortController) {
      prefetchAbortController.abort()
      prefetchAbortController = null
    }
    if (prefetchTaskAbortController) {
      prefetchTaskAbortController.abort()
      prefetchTaskAbortController = null
    }

    if (prefetchIdleTaskId !== null) {
      if (
        typeof prefetchIdleTaskId === 'number' &&
        prefetchIdleTaskId >= 0 &&
        typeof window !== 'undefined' &&
        typeof window.cancelIdleCallback === 'function'
      ) {
        window.cancelIdleCallback(prefetchIdleTaskId)
      } else if (prefetchIdleTaskId !== -1) {
        clearTimeout(prefetchIdleTaskId)
      }
      prefetchIdleTaskId = null
    }

    if (typeof getCachedChapterContent(chapter.url) === 'string') {
      return
    }

    const requestCacheKey = getChapterRequestCacheKey(chapter)
    if (inflightChapterContentRequests.has(requestCacheKey)) {
      return
    }

    const abortController = new AbortController()
    prefetchAbortController = abortController

    const executePrefetch = () => {
      prefetchIdleTaskId = null
      if (abortController.signal.aborted) {
        return
      }
      const currentBook = state.currentBook.value
      if (!currentBook) {
        return
      }

      const catalog = state.catalog.value
      if (!catalog || catalog.length === 0) {
        return
      }

      const startIdx = catalog.findIndex(c => c.url === chapter.url)
      if (startIdx < 0) {
        return
      }

      const slice = catalog.slice(startIdx, startIdx + PREFETCH_BATCH_MAX)
      const toPrefetch: Chapter[] = []
      for (const ch of slice) {
        if (typeof getCachedChapterContent(ch.url) === 'string') {
          continue
        }
        const k = getChapterRequestCacheKey(ch, currentBook)
        if (inflightChapterContentRequests.has(k)) {
          continue
        }
        toPrefetch.push(ch)
      }

      if (toPrefetch.length === 0) {
        return
      }

      if (toPrefetch.length === 1) {
        void fetchChapterContent(toPrefetch[0]).catch(() => undefined)
        return
      }

      const urls = toPrefetch.map(ch => ch.url)
      const batchPromise = (async () => {
        const res = await readerApi.batchContent(currentBook.sourceId, urls)
        if (!res.isSuccess) {
          throw new Error(res.errorMsg || '批量预取正文失败')
        }
        const data = res.data
        if (!data?.results) {
          return
        }
        for (const row of data.results) {
          const text = row.content?.trim()
          if (text && row.url) {
            if (
              state.currentBook.value?.sourceId === currentBook.sourceId &&
              state.currentBook.value?.bookUrl === currentBook.bookUrl
            ) {
              cacheChapterContent(row.url, text)
            }
          }
        }
      })().catch(() => undefined)

      for (const ch of toPrefetch) {
        const k = getChapterRequestCacheKey(ch, currentBook)
        inflightChapterContentRequests.set(
          k,
          batchPromise.then(() => {
            const c = getCachedChapterContent(ch.url)
            if (typeof c !== 'string') {
              throw new Error('预取未完成')
            }
            return c
          })
        )
      }

      void batchPromise.finally(() => {
        for (const ch of toPrefetch) {
          inflightChapterContentRequests.delete(getChapterRequestCacheKey(ch, currentBook))
        }
      })
    }

    prefetchIdleTaskId = scheduleBackgroundTask(executePrefetch, PREFETCH_IDLE_TIMEOUT_MS)
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
  }
}
