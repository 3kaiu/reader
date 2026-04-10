import type { ApiFetchOptions, ApiResponse } from './http/types'
import { requestOptimizer, networkDetector } from '@/services/network/optimizer'
import { offlineManager, offlineContentServer } from '@/services/offline/manager'
import { logger } from '@/utils/logger'
import {
  cleanExpiredApiCache,
  clearApiResponseCache,
  createCacheKey,
  getCachedApiResponse,
  getOfflineCacheMetadata,
  rememberApiResponse,
} from './http/cache'
import { requestWithDirectFallback } from './http/transport'
import { normalizeApiResponse } from './http/types'

export type { ApiFetchOptions, ApiResponse } from './http/types'

// 自动清理过期缓存 (每分钟)
if (typeof window !== 'undefined') {
  setInterval(() => {
    cleanExpiredApiCache()
  }, 60 * 1000)
}

async function enqueueOfflineMutation(
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  data?: unknown
): Promise<void> {
  try {
    await offlineManager.queueOperation({
      type: 'api-request',
      method,
      url,
      data,
    })
  } catch (error) {
    logger.error('Failed to queue offline API operation', { error, method, url })
  }
}

async function requestMutation<T>(
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  body?: unknown,
  options?: ApiFetchOptions
): Promise<ApiResponse<T>> {
  const response = await requestWithDirectFallback<unknown>(url, {
    ...options,
    method,
    ...(body === undefined ? {} : { body }),
  })
  clearApiResponseCache()
  return normalizeApiResponse<T>(response)
}

export const $get = <T>(url: string, options?: ApiFetchOptions) => {
  const method = 'GET'
  const cacheKey = createCacheKey('api', url, JSON.stringify(options?.params || {}))
  const offlineCacheMetadata = getOfflineCacheMetadata(url, options)

  if (!networkDetector.getNetworkInfo().isOnline) {
    return offlineContentServer
      .serveFromCache(cacheKey)
      .then(data => normalizeApiResponse<T>(data))
      .catch(() => {
        throw new Error('Content not available offline')
      })
  }

  const cached = getCachedApiResponse<T>(cacheKey)
  if (cached) {
    return Promise.resolve(cached)
  }

  return requestOptimizer.deduplicateRequest(cacheKey, async () => {
    const response = await requestWithDirectFallback<unknown>(url, { ...options, method })
    const result = normalizeApiResponse<T>(response)

    if (result.isSuccess) {
      rememberApiResponse(cacheKey, result)

      offlineManager.cacheContent({
        id: cacheKey,
        type: offlineCacheMetadata.type,
        url,
        data: result,
        size: JSON.stringify(result).length * 2,
        priority: offlineCacheMetadata.priority,
        bookUrl: offlineCacheMetadata.bookUrl,
        chapterUrl: offlineCacheMetadata.chapterUrl,
      })
    }

    return result
  })
}

export const $post = <T>(url: string, body?: unknown, options?: ApiFetchOptions) => {
  if (!networkDetector.getNetworkInfo().isOnline) {
    void enqueueOfflineMutation('POST', url, body)
    return Promise.resolve({ isSuccess: true, data: null } as ApiResponse<T>)
  }

  return requestOptimizer.requestWithRetry(() => requestMutation<T>('POST', url, body, options))
}

export const $put = <T>(url: string, body?: unknown, options?: ApiFetchOptions) => {
  return requestOptimizer.requestWithRetry(() => requestMutation<T>('PUT', url, body, options))
}

export const $delete = <T>(url: string, options?: ApiFetchOptions) => {
  return requestOptimizer.requestWithRetry(() =>
    requestMutation<T>('DELETE', url, undefined, options)
  )
}

export const $patch = <T>(url: string, body?: unknown, options?: ApiFetchOptions) => {
  return requestOptimizer.requestWithRetry(() => requestMutation<T>('PATCH', url, body, options))
}
