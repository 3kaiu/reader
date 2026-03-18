import { ofetch, type FetchOptions } from 'ofetch'
import { decode, encode } from '@msgpack/msgpack'
import {
  API_CACHE_TTL,
  API_TIMEOUT,
  API_MAX_RETRIES,
  API_RETRY_DELAY_MULTIPLIER,
} from '@/constants/api'
import { requestOptimizer, networkDetector } from '@/services/network/optimizer'
import { perfMonitor } from '@/services/performance/monitor'
import { offlineManager, offlineContentServer } from '@/services/offline/manager'
import { NexusError, ErrorCode, reportError } from '@/utils/errors'

// 请求缓存
const MAX_CACHE_SIZE = 100
const requestCache = new Map<string, { data: any; timestamp: number }>()

// 错误消息翻译映射（技术性错误 -> 用户友好消息）
const ERROR_MESSAGE_MAP: Record<string, string> = {
  // 网络错误
  'Network request failed': '网络连接失败，请检查网络后重试',
  'Request timeout': '请求超时，请稍后重试',
  'Failed to fetch': '无法连接到服务器，请检查网络',

  // 业务错误
  'Source not found': '书源不存在，请选择其他书源',
  'Book not found': '书籍不存在或已被删除',
  'Chapter not found': '章节不存在',
  'Rule mismatch': '内容解析失败，请尝试其他书源',

  // 服务器错误
  'Internal server error': '服务器内部错误，请稍后重试',
  'Service temporarily unavailable': '服务暂时不可用，请稍后重试',
  'Bad request': '请求参数错误，请重试',

  // 认证错误
  Unauthorized: '登录已过期，请重新登录',
  Forbidden: '没有权限访问此资源',
}

// 将技术性错误消息转换为用户友好的消息
function translateErrorMessage(errorMsg: string): string {
  // 精确匹配
  if (ERROR_MESSAGE_MAP[errorMsg]) {
    return ERROR_MESSAGE_MAP[errorMsg]
  }

  // 模糊匹配
  for (const [pattern, friendlyMsg] of Object.entries(ERROR_MESSAGE_MAP)) {
    if (errorMsg.toLowerCase().includes(pattern.toLowerCase())) {
      return friendlyMsg
    }
  }

  // 如果没有匹配，返回原消息（可能是已经用户友好的消息）
  return errorMsg
}

// 将网络错误转换为NexusError
function convertToNexusError(error: any, url: string, method: string): NexusError {
  // 如果已经是NexusError，直接返回
  if (error instanceof NexusError) {
    return error
  }

  // 根据错误类型转换为相应的ErrorCode
  if (error.name === 'AbortError' || error.message?.includes('timeout')) {
    return new NexusError(ErrorCode.TIMEOUT, '请求超时，请稍后重试', error.message, {
      url,
      method,
      originalError: error.toString(),
    })
  } else if (
    error.message?.includes('NetworkError') ||
    error.message?.includes('Failed to fetch')
  ) {
    return new NexusError(
      ErrorCode.NETWORK_ERROR,
      '网络连接失败，请检查网络后重试',
      error.message,
      { url, method, originalError: error.toString() }
    )
  } else if (error.status === 401) {
    return new NexusError(ErrorCode.UNAUTHORIZED, '登录已过期，请重新登录', undefined, {
      url,
      method,
      status: error.status,
    })
  } else if (error.status === 403) {
    return new NexusError(ErrorCode.FORBIDDEN, '没有权限访问此资源', undefined, {
      url,
      method,
      status: error.status,
    })
  } else if (error.status === 429) {
    return new NexusError(ErrorCode.RATE_LIMITED, '请求过于频繁，请稍后重试', undefined, {
      url,
      method,
      status: error.status,
      retryAfter: error.response?.headers?.['retry-after'],
    })
  } else if (error.status >= 500) {
    return new NexusError(ErrorCode.INTERNAL_ERROR, '服务器内部错误，请稍后重试', undefined, {
      url,
      method,
      status: error.status,
    })
  } else {
    // 其他错误
    return new NexusError(
      ErrorCode.UNKNOWN_ERROR,
      translateErrorMessage(error.message || '未知错误'),
      error.message,
      { url, method, originalError: error.toString() }
    )
  }
}

// API 响应类型
export interface ApiResponse<T = unknown> {
  isSuccess: boolean
  data: T
  errorMsg?: string
}

// 请求缓存 Map (LRU实现)
const apiCacheMap = new Map<string, { data: unknown; timestamp: number }>()

function createCacheKey(prefix: string, url: string, params: string): string {
  return `${prefix}:${url}:${params}`
}

// 请求去重 Map
const pendingRequests = new Map<string, Promise<unknown>>()

import { useErrorHandler } from '@/composables/useErrorHandler'

interface ErrorHandlerInstance {
  handleError: (error: unknown, context?: string, silent?: boolean) => void
}

// 统一错误处理实例 (单例，由 internalFetch 使用)
let errorHandlerInstance: ErrorHandlerInstance | null = null
function getGlobalErrorHandler() {
  if (!errorHandlerInstance) {
    errorHandlerInstance = useErrorHandler() as unknown as ErrorHandlerInstance
  }
  return errorHandlerInstance
}

// 创建内部原始 ofetch 实例（带重试和全局拦截）
const internalFetch = ofetch.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: API_TIMEOUT,
  retry: API_MAX_RETRIES,
  retryDelay: API_RETRY_DELAY_MULTIPLIER,
  retryStatusCodes: [408, 500, 502, 503, 504],
  onRequest({ options, request }) {
    const edgeBaseUrl = import.meta.env.VITE_API_URL || '/api'
    const directBaseUrl = import.meta.env.VITE_NEXUS_LITE_DIRECT_URL || ''
    const directApiKey = import.meta.env.VITE_NEXUS_LITE_API_KEY || ''

    const requestUrl = request.toString()
    const isAbsolute = /^https?:\/\//i.test(requestUrl)
    const pathname = !isAbsolute ? requestUrl.split('?')[0] : ''

    // If caller forces edge (direct-connect fallback), skip direct selection.
    if ((options as any).forceEdge === true) {
      ;(options as any).baseURL = edgeBaseUrl
      ;(options as any)._usedDirect = false
    } else {
      // Only direct-connect a safe allowlist of nexus-lite endpoints.
      const directAllowlistPrefixes = [
        '/api/search',
        '/api/book',
        '/api/chapters',
        '/api/content',
        '/api/batch/content',
        '/api/sources',
        '/api/bookshelf',
        '/api/groups',
        '/api/replace_rules',
        '/api/discovery',
        '/api/ai/',
        '/api/voice/',
        '/ws/',
      ]
      const shouldUseDirect =
        Boolean(directBaseUrl) &&
        !isAbsolute &&
        directAllowlistPrefixes.some(p => pathname === p || pathname.startsWith(p))

      // Worker-only endpoints must always go through edge.
      const workerOnlyPrefixes = [
        '/api/analytics',
        '/api/preferences',
        '/api/content/upload',
        '/api/backup',
      ]
      const isWorkerOnly =
        !isAbsolute && workerOnlyPrefixes.some(p => pathname === p || pathname.startsWith(p))

      if (shouldUseDirect && !isWorkerOnly) {
        ;(options as any).baseURL = directBaseUrl
        ;(options as any)._usedDirect = true
        if (directApiKey) {
          options.headers = {
            ...((options.headers as any) || {}),
            'X-API-Key': directApiKey,
          }
        }
      } else {
        ;(options as any).baseURL = edgeBaseUrl
        ;(options as any)._usedDirect = false
      }
    }

    // 记录请求开始时间
    const startTime = performance.now()
    ;(options as any)._startTime = startTime
    ;(options as any)._requestUrl = request.toString()
    ;(options as any)._method = options.method || 'GET'
    ;(options as any)._directFallbackTried = (options as any)._directFallbackTried === true

    // Attach request id for end-to-end tracing (Worker/Rust can log/echo it).
    const requestId = crypto.randomUUID()
    ;(options as any)._requestId = requestId
    options.headers = {
      ...((options.headers as any) || {}),
      'X-Request-ID': requestId,
    }

    const token = localStorage.getItem('nexus_auth_token')
    if (token) {
      options.headers = {
        ...((options.headers as any) || {}),
        Authorization: `Bearer ${token}`,
      }
    }

    // 如果指定了使用 msgpack 发送请求
    if ((options as any).msgpack && options.body) {
      options.body = encode(options.body)
      options.headers = {
        ...((options.headers as any) || {}),
        'Content-Type': 'application/x-msgpack',
        Accept: 'application/x-msgpack',
      }
    }
  },

  // ... (existing code omitted for brevity)

  onResponse({ response, options }) {
    // 监控 API 响应时间
    const startTime = (options as any)._startTime
    if (startTime) {
      const responseTime = performance.now() - startTime
      const endpoint = new URL(response.url).pathname
      const route = (options as any)._usedDirect
        ? (options as any)._directFallbackTried
          ? 'direct_fallback'
          : 'direct'
        : 'edge'

      // Route distribution (count)
      perfMonitor.record({
        name: 'api_route',
        value: 1,
        unit: 'ms',
        tags: {
          endpoint,
          status: response.status,
          route,
          method: (options as any)._method || 'GET',
        },
      })

      perfMonitor.record({
        name: 'api_response_ms',
        value: Number(responseTime.toFixed(2)),
        unit: 'ms',
        tags: {
          endpoint,
          status: response.status,
          route,
          method: (options as any)._method || 'GET',
        },
      })
    }

    // 处理二进制消息 (MessagePack)
    const contentType = response.headers.get('content-type')
    if (contentType === 'application/x-msgpack') {
      try {
        // ofetch 默认会将数据读为 _data
        const buffer = response._data
        if (buffer instanceof Uint8Array || buffer instanceof ArrayBuffer) {
          response._data = decode(new Uint8Array(buffer))
        }
      } catch (e) {
        console.error('[API] Failed to decode MessagePack', e)
      }
    }

    // 业务级别错误拦截
    const data = response._data
    // 如果 options 中显式指定 silent: true，则不显示全避提示
    const silent = (options as any).silent === true

    if (data && typeof data === 'object' && data.isSuccess === false && !silent) {
      try {
        const handler = getGlobalErrorHandler()
        // 将技术性错误消息转换为用户友好的消息
        const userFriendlyMessage = translateErrorMessage(data.errorMsg || '业务操作失败')
        handler.handleError(userFriendlyMessage, '', true)
      } catch (e) {
        // 使用 logger 而不是 console.error
        if (import.meta.env.DEV) {
          console.error('[API Interceptor] Failed to report business error', e)
        }
      }
    }
  },
  onResponseError({ response, error, options }) {
    const url = (options as any)._requestUrl || response.url
    const method = (options as any)._method || 'GET'

    // 监控错误响应时间
    const startTime = (options as any)._startTime
    if (startTime) {
      const responseTime = performance.now() - startTime
      const endpoint = new URL(response.url).pathname
      const route = (options as any)._usedDirect
        ? (options as any)._directFallbackTried
          ? 'direct_fallback'
          : 'direct'
        : 'edge'

      // Route distribution (count) including errors
      perfMonitor.record({
        name: 'api_route',
        value: 1,
        unit: 'ms',
        tags: {
          endpoint,
          status: response.status,
          route,
          method,
        },
      })

      perfMonitor.record({
        name: 'api_error_duration',
        value: Number(responseTime.toFixed(2)),
        unit: 'ms',
        tags: {
          status: response.status,
          endpoint,
          url,
          method,
          route,
        },
      })
    }

    // 处理鉴权失效
    if (response.status === 401) {
      localStorage.removeItem('nexus_auth_token')
    }

    // 系统级别错误拦截 (非 2xx 响应)
    const silent = (options as any).silent === true

    if (response.status >= 400 && !silent) {
      try {
        // 转换为NexusError
        const nexusError = convertToNexusError(
          {
            status: response.status,
            message: error?.message || response.statusText,
            response,
          },
          url,
          method
        )

        // 报告错误
        reportError(nexusError, {
          status: response.status,
          url,
          method,
          responseData: response._data,
        })

        // 向后兼容：使用全局错误处理器
        const handler = getGlobalErrorHandler()
        if (handler && 'handleError' in handler) {
          handler.handleError(nexusError.message, nexusError.details || nexusError.message)
        }
      } catch (e) {
        if (import.meta.env.DEV) {
          console.error('[API Interceptor] Error handling failed', e)
        }
      }
    }
  },
})

function isLikelyNetworkOrCorsError(err: any): boolean {
  const msg = String(err?.message || err || '')
  return (
    err?.name === 'AbortError' ||
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    (msg.toLowerCase().includes('fetch') && msg.toLowerCase().includes('failed'))
  )
}

async function requestWithDirectFallback<T>(
  url: string,
  options: FetchOptions<'json'> = {}
): Promise<T> {
  try {
    return await internalFetch<T>(url, options)
  } catch (e) {
    const directBaseUrl = import.meta.env.VITE_NEXUS_LITE_DIRECT_URL || ''
    const usedDirect = (options as any)._usedDirect === true
    const alreadyTriedFallback = (options as any)._directFallbackTried === true
    if (!directBaseUrl || !usedDirect || alreadyTriedFallback || !isLikelyNetworkOrCorsError(e)) {
      throw e
    }
    return await internalFetch<T>(url, {
      ...options,
      forceEdge: true,
      _directFallbackTried: true,
    } as any)
  }
}

// Export a helper for non-ofetch call sites (e.g. SSE) to pick the right base URL.
export function getApiBaseUrlForPath(path: string): string {
  const edgeBaseUrl = import.meta.env.VITE_API_URL || '/api'
  const directBaseUrl = import.meta.env.VITE_NEXUS_LITE_DIRECT_URL || ''
  if (!directBaseUrl) return edgeBaseUrl

  const pathname = path.split('?')[0]
  const directAllowlistPrefixes = [
    '/api/search',
    '/api/book',
    '/api/chapters',
    '/api/content',
    '/api/batch/content',
    '/api/sources',
    '/api/bookshelf',
    '/api/groups',
    '/api/replace_rules',
    '/api/discovery',
    '/api/ai/',
    '/api/voice/',
  ]
  const workerOnlyPrefixes = [
    '/api/analytics',
    '/api/preferences',
    '/api/content/upload',
    '/api/backup',
  ]
  const isWorkerOnly = workerOnlyPrefixes.some(p => pathname === p || pathname.startsWith(p))
  if (isWorkerOnly) return edgeBaseUrl

  const shouldUseDirect = directAllowlistPrefixes.some(
    p => pathname === p || pathname.startsWith(p)
  )
  return shouldUseDirect ? directBaseUrl : edgeBaseUrl
}

// 对外暴露的基础实例
export const api = internalFetch

// 自动清理过期缓存 (每分钟)
if (typeof window !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    const keysToDelete: string[] = []

    for (const [key, value] of requestCache.entries()) {
      if (now - value.timestamp > API_CACHE_TTL) {
        keysToDelete.push(key)
      }
    }

    // 批量删除过期缓存
    keysToDelete.forEach(key => requestCache.delete(key))

    // 如果缓存仍然过大，删除最旧的项
    if (requestCache.size > MAX_CACHE_SIZE) {
      const excess = requestCache.size - MAX_CACHE_SIZE
      const oldestKeys = Array.from(requestCache.keys()).slice(0, excess)
      oldestKeys.forEach(key => requestCache.delete(key))
    }
  }, 60 * 1000)
}

// 便捷方法：带缓存和去重的 GET 请求
export const $get = <T>(url: string, options?: FetchOptions) => {
  const method = 'GET'
  const cacheKey = createCacheKey('api', url, JSON.stringify(options?.params || {}))

  // 如果离线，尝试从缓存提供内容
  if (!networkDetector.getNetworkInfo().isOnline) {
    return offlineContentServer
      .serveFromCache(cacheKey)
      .then(data => ({ isSuccess: true, data }) as ApiResponse<T>)
      .catch(() => {
        throw new Error('Content not available offline')
      })
  }

  // 尝试从缓存获取
  const cached = apiCacheMap.get(cacheKey)
  const now = Date.now()
  if (cached && now - cached.timestamp < API_CACHE_TTL) {
    return Promise.resolve(cached.data as ApiResponse<T>)
  } else if (cached) {
    apiCacheMap.delete(cacheKey)
  }

  // 使用请求优化器进行去重请求
  return requestOptimizer.deduplicateRequest(cacheKey, async () => {
    const response = await requestWithDirectFallback<any>(url, { ...options, method } as any)

    // 适配 Nexus-lite: 如果已经是包装后的格式则直接返回，否则手动包装
    const result: ApiResponse<T> =
      response && typeof response === 'object' && 'isSuccess' in response
        ? response
        : { isSuccess: true, data: response }

    if (result.isSuccess) {
      // 写入缓存
      apiCacheMap.set(cacheKey, { data: result, timestamp: Date.now() })

      // 限制缓存大小
      if (apiCacheMap.size > 1000) {
        const firstKey = apiCacheMap.keys().next().value
        if (firstKey) apiCacheMap.delete(firstKey)
      }

      // 缓存到离线管理器（用于离线访问）
      offlineManager.cacheContent({
        id: cacheKey,
        type: 'api-response',
        url,
        data: result,
        size: JSON.stringify(result).length * 2,
        priority: 5,
      })
    }

    return result
  })
}

export const $post = <T>(url: string, body?: unknown, options?: FetchOptions) => {
  // 如果离线，将操作加入队列
  if (!networkDetector.getNetworkInfo().isOnline) {
    offlineManager.queueOperation({
      type: 'api-request',
      method: 'POST',
      url,
      data: body,
    })
    return Promise.resolve({ isSuccess: true, data: null } as ApiResponse<T>)
  }

  return requestOptimizer.requestWithRetry(async () => {
    const response = await requestWithDirectFallback<any>(url, {
      method: 'POST',
      body,
      ...options,
    } as any)
    apiCacheMap.clear()
    return response && typeof response === 'object' && 'isSuccess' in response
      ? (response as ApiResponse<T>)
      : ({ isSuccess: true, data: response } as ApiResponse<T>)
  })
}

export const $put = <T>(url: string, body?: unknown, options?: FetchOptions) => {
  return requestOptimizer.requestWithRetry(async () => {
    const response = await requestWithDirectFallback<any>(url, {
      method: 'PUT',
      body,
      ...options,
    } as any)
    apiCacheMap.clear()
    return response && typeof response === 'object' && 'isSuccess' in response
      ? (response as ApiResponse<T>)
      : ({ isSuccess: true, data: response } as ApiResponse<T>)
  })
}

export const $delete = <T>(url: string, options?: FetchOptions) => {
  return requestOptimizer.requestWithRetry(async () => {
    const response = await requestWithDirectFallback<any>(url, {
      ...options,
      method: 'DELETE',
    } as any)
    apiCacheMap.clear()
    return response && typeof response === 'object' && 'isSuccess' in response
      ? (response as ApiResponse<T>)
      : ({ isSuccess: true, data: response } as ApiResponse<T>)
  })
}

export const $patch = <T>(url: string, body?: unknown, options?: FetchOptions) => {
  return requestOptimizer.requestWithRetry(async () => {
    const response = await requestWithDirectFallback<any>(url, {
      method: 'PATCH',
      body,
      ...options,
    } as any)
    apiCacheMap.clear()
    return response && typeof response === 'object' && 'isSuccess' in response
      ? (response as ApiResponse<T>)
      : ({ isSuccess: true, data: response } as ApiResponse<T>)
  })
}

/**
 * 清理 API 请求缓存
 *
 * 清除所有缓存的请求响应和待处理的请求
 * 通常在用户登出或需要强制刷新数据时调用
 *
 * @example
 * ```typescript
 * clearApiCache() // 清除所有缓存
 * ```
 */
export function clearApiCache() {
  requestCache.clear()
  pendingRequests.clear()
  apiCacheMap.clear()
}

/**
 * 清理过期的 API 缓存
 *
 * 只删除超过 TTL 的缓存项，保留仍在有效期内的缓存
 * 可以定期调用以释放内存
 *
 * @example
 * ```typescript
 * // 定期清理（例如每分钟）
 * setInterval(() => cleanExpiredCache(), 60 * 1000)
 * ```
 */
export function cleanExpiredCache() {
  const now = Date.now()
  for (const [key, value] of requestCache.entries()) {
    if (now - value.timestamp > API_CACHE_TTL) {
      requestCache.delete(key)
    }
  }
  // 新的缓存管理器会自动清理过期项
}

/**
 * 获取 API 缓存统计信息
 */
export function getApiCacheStats() {
  return {
    size: apiCacheMap.size,
    pending: pendingRequests.size,
  }
}

export default api
