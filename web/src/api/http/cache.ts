import type { ApiFetchOptions, ApiResponse, OfflineCacheMetadata } from './types'
import { API_CACHE_TTL } from '@/constants/api'

const MAX_CACHE_SIZE = 1000
const apiCacheMap = new Map<string, { data: unknown; timestamp: number }>()

export function createCacheKey(prefix: string, url: string, params: string): string {
  return `${prefix}:${url}:${params}`
}

export function getCachedApiResponse<T>(cacheKey: string): ApiResponse<T> | null {
  const cached = apiCacheMap.get(cacheKey)
  if (!cached) {
    return null
  }

  const now = Date.now()
  if (now - cached.timestamp >= API_CACHE_TTL) {
    apiCacheMap.delete(cacheKey)
    return null
  }

  return cached.data as ApiResponse<T>
}

export function rememberApiResponse<T>(cacheKey: string, response: ApiResponse<T>): void {
  apiCacheMap.set(cacheKey, {
    data: response,
    timestamp: Date.now(),
  })

  if (apiCacheMap.size <= MAX_CACHE_SIZE) {
    return
  }

  const firstKey = apiCacheMap.keys().next().value
  if (firstKey) {
    apiCacheMap.delete(firstKey)
  }
}

export function clearApiResponseCache(): void {
  apiCacheMap.clear()
}

export function cleanExpiredApiCache(): void {
  const now = Date.now()
  for (const [key, value] of apiCacheMap.entries()) {
    if (now - value.timestamp > API_CACHE_TTL) {
      apiCacheMap.delete(key)
    }
  }

  if (apiCacheMap.size <= MAX_CACHE_SIZE) {
    return
  }

  const excess = apiCacheMap.size - MAX_CACHE_SIZE
  const oldestKeys = Array.from(apiCacheMap.keys()).slice(0, excess)
  oldestKeys.forEach(key => apiCacheMap.delete(key))
}

export function getOfflineCacheMetadata(
  url: string,
  options?: ApiFetchOptions
): OfflineCacheMetadata {
  const params = (options?.params as Record<string, unknown> | undefined) ?? {}
  const bookUrl = typeof params.bookUrl === 'string' ? params.bookUrl : undefined
  const chapterUrl = typeof params.url === 'string' ? params.url : undefined

  if (url === '/content' && bookUrl && chapterUrl) {
    return {
      type: 'chapter',
      priority: 10,
      bookUrl,
      chapterUrl,
    }
  }

  return {
    type: 'api-response',
    priority: 5,
    bookUrl: undefined,
    chapterUrl: undefined,
  }
}
