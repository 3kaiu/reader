import { $post } from './client'
import { isLikelyNetworkOrCorsError } from './http/errors'
import { mergeHeaders, resolveBaseUrl, attachAuthHeaders } from './http/transport/request'
import type { InternalApiFetchOptions } from './http/types'
import type { SearchError, SearchResponse, SearchResult } from '@/types/search'

export type { SearchError, SearchResponse, SearchResult }

type SearchPayload = {
  keyword: string
  sources?: string[]
}

type SearchStreamOptions = {
  signal?: AbortSignal
  onResult?: (result: SearchResult) => void
  onError?: (error: SearchError) => void
  onDone?: (total: number) => void
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError'
}

function joinBaseUrl(baseURL: string | undefined, requestUrl: string): string {
  if (!baseURL) {
    return requestUrl
  }

  const normalizedBase = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL
  const normalizedPath = requestUrl.startsWith('/') ? requestUrl : `/${requestUrl}`
  return `${normalizedBase}${normalizedPath}`
}

async function toRequestError(response: Response): Promise<Error> {
  let message = `搜索失败 (${response.status})`

  try {
    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const data = (await response.json()) as
        | { message?: string; error?: string; errorMsg?: string }
        | undefined
      message = data?.message || data?.error || data?.errorMsg || message
    } else {
      const text = await response.text()
      if (text) {
        message = text
      }
    }
  } catch {
    // ignore parse failures and keep fallback message
  }

  const error = new Error(message) as Error & {
    status?: number
    response?: Response
  }
  error.status = response.status
  error.response = response
  return error
}

function processSseEventBlock(
  block: string,
  handlers: Required<Pick<SearchStreamOptions, 'onResult' | 'onError' | 'onDone'>>
): void {
  const normalizedBlock = block.replace(/\r/g, '').trim()
  if (!normalizedBlock || normalizedBlock.startsWith(':')) {
    return
  }

  let eventName = 'message'
  const dataLines: string[] = []

  normalizedBlock.split('\n').forEach(line => {
    if (line.startsWith('event:')) {
      eventName = line.slice('event:'.length).trim()
      return
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim())
    }
  })

  if (dataLines.length === 0) {
    return
  }

  const dataText = dataLines.join('\n')
  const payload = JSON.parse(dataText) as
    | { data?: SearchResult; source_id?: string; error?: string; total?: number }
    | undefined

  if (eventName === 'result' && payload?.data) {
    handlers.onResult(payload.data)
    return
  }

  if (eventName === 'error' && payload?.source_id && payload.error) {
    handlers.onError({
      sourceId: payload.source_id,
      error: payload.error,
    })
    return
  }

  if (eventName === 'done') {
    handlers.onDone(typeof payload?.total === 'number' ? payload.total : 0)
  }
}

async function consumeSearchStream(
  response: Response,
  options: SearchStreamOptions
): Promise<void> {
  if (!response.body) {
    throw new Error('搜索流不可用')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const handlers = {
    onResult: options.onResult || (() => undefined),
    onError: options.onError || (() => undefined),
    onDone: options.onDone || (() => undefined),
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '')

    let separatorIndex = buffer.indexOf('\n\n')
    while (separatorIndex >= 0) {
      const block = buffer.slice(0, separatorIndex)
      buffer = buffer.slice(separatorIndex + 2)
      processSseEventBlock(block, handlers)
      separatorIndex = buffer.indexOf('\n\n')
    }
  }

  const remaining = `${buffer}${decoder.decode()}`.trim()
  if (remaining) {
    processSseEventBlock(remaining, handlers)
  }
}

async function requestSearchStream(
  payload: SearchPayload,
  options: SearchStreamOptions,
  forceEdge = false
): Promise<{ usedDirect: boolean }> {
  const requestUrl = '/search/stream'
  const requestOptions = {
    method: 'POST',
    forceEdge,
    signal: options.signal,
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
    },
  } as InternalApiFetchOptions

  resolveBaseUrl(requestOptions, requestUrl)
  attachAuthHeaders(requestOptions)
  requestOptions.headers = mergeHeaders(requestOptions.headers, {
    Accept: 'text/event-stream',
    'Content-Type': 'application/json',
  })

  const response = await fetch(
    joinBaseUrl(requestOptions.baseURL as string | undefined, requestUrl),
    {
      method: 'POST',
      headers: requestOptions.headers as HeadersInit,
      body: JSON.stringify(payload),
      signal: options.signal,
    }
  )

  if (!response.ok) {
    throw await toRequestError(response)
  }

  await consumeSearchStream(response, options)

  return {
    usedDirect: requestOptions._usedDirect === true,
  }
}

export const searchApi = {
  searchBooks: (keyword: string, sources: string[] = []) =>
    $post<SearchResponse>('/search', { keyword, sources }),

  async searchBooksStream(
    keyword: string,
    sources: string[] = [],
    options: SearchStreamOptions = {}
  ): Promise<void> {
    const payload: SearchPayload = { keyword, sources }

    try {
      await requestSearchStream(payload, options)
    } catch (error) {
      const hasDirectBaseUrl = Boolean(import.meta.env.VITE_NEXUS_LITE_DIRECT_URL || '')

      if (!hasDirectBaseUrl || isAbortError(error) || !isLikelyNetworkOrCorsError(error)) {
        throw error
      }

      await requestSearchStream(payload, options, true)
    }
  },
}
