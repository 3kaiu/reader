import type { FetchOptions } from 'ofetch'

export interface ApiResponse<T = unknown> {
  isSuccess: boolean
  data: T
  errorMsg?: string
}

export type ApiFetchOptions = FetchOptions<'json'> & {
  silent?: boolean
  msgpack?: boolean
  forceEdge?: boolean
}

export type InternalApiFetchOptions = ApiFetchOptions & {
  _usedDirect?: boolean
  _startTime?: number
  _requestUrl?: string
  _method?: string
  _requestId?: string
  _directFallbackTried?: boolean
}

export interface OfflineCacheMetadata {
  type: 'chapter' | 'api-response'
  priority: number
  bookUrl?: string
  chapterUrl?: string
}

export function isApiResponse<T = unknown>(value: unknown): value is ApiResponse<T> {
  return Boolean(value && typeof value === 'object' && 'isSuccess' in value)
}

export function normalizeApiResponse<T>(value: unknown): ApiResponse<T> {
  if (isApiResponse<T>(value)) {
    return value
  }

  return {
    isSuccess: true,
    data: value as T,
  }
}
