import { ofetch, type FetchOptions } from 'ofetch'
import { useUserStore } from '@/stores/user'
import { API_CACHE_TTL, API_TIMEOUT, API_MAX_RETRIES, API_RETRY_DELAY_MULTIPLIER } from '@/constants/api'

// API 响应类型
export interface ApiResponse<T = unknown> {
  isSuccess: boolean
  data: T
  errorMsg?: string
}

// 请求缓存 Map
const requestCache = new Map<string, { data: unknown; timestamp: number }>()

// 请求去重 Map
const pendingRequests = new Map<string, Promise<unknown>>()

// 判断是否应该重试
interface FetchError {
  response?: { status: number }
}
const shouldRetry = (error: FetchError): boolean => {
  // 网络错误或 5xx 服务器错误时重试
  if (!error.response) return true // 网络错误
  const status = error.response.status
  return status >= 500 && status < 600
}

import { useErrorHandler } from '@/composables/useErrorHandler'

interface ErrorHandlerInstance {
  handleApiError: (error: unknown, context?: string) => void
}

// 统一错误处理实例 (单例，由 internalFetch 使用)
let errorHandlerInstance: ErrorHandlerInstance | null = null
function getGlobalErrorHandler() {
  if (!errorHandlerInstance) {
    errorHandlerInstance = useErrorHandler() as ErrorHandlerInstance
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
  onRequest({ options }) {
    const token = localStorage.getItem('api_token')
    if (token) {
      options.params = { ...options.params, accessToken: token }
    }
  },
  onResponse({ response, options }) {
    // 业务级别错误拦截 (如果 isSuccess 为 false)
    const data = response._data
    // 如果 options 中显式指定 silent: true，则不显示全避提示
    const silent = (options as any).silent === true

    if (data && typeof data === 'object' && data.isSuccess === false && !silent) {
      try {
        const handler = getGlobalErrorHandler()
        handler.handleError(data.errorMsg || '业务操作失败', '', true)
      } catch (e) {
        console.error('[API Interceptor] Failed to report business error', e)
      }
    }
  },
  onResponseError({ response, error, options }) {
    // 系统级别错误拦截 (非 2xx 响应)
    const silent = (options as any).silent === true

    if (response.status === 401) {
      // 处理鉴权失效
      localStorage.removeItem('api_token')
    }

    if (response.status >= 400 && !silent) {
      try {
        const handler = getGlobalErrorHandler()
        handler.handleError(error || `HTTP Error ${response.status}`, `请求失败 (${response.status})`, true)
      } catch (e) {
        console.error('[API Interceptor] Global error handler failed', e)
      }
    }
  },
})

// 对外暴露的基础实例
export const api = internalFetch

// 自动清理过期缓存 (每分钟)
if (typeof window !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, value] of requestCache.entries()) {
      if (now - value.timestamp > API_CACHE_TTL) {
        requestCache.delete(key)
      }
    }
  }, 60 * 1000)
}

// 便捷方法：带缓存和去重的 GET 请求
export const $get = <T>(url: string, options?: FetchOptions) => {
  const method = 'GET'
  const cacheKey = `${url}_${JSON.stringify(options?.params || {})}`

  const cached = requestCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < API_CACHE_TTL) {
    return Promise.resolve(cached.data as ApiResponse<T>)
  }

  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey) as Promise<ApiResponse<T>>
  }

  const requestPromise = internalFetch<any>(url, { ...options, method })
    .then((response) => {
      // 适配 Nexus-lite: 如果已经是包装后的格式则直接返回，否则手动包装
      const result: ApiResponse<T> = (response && typeof response === 'object' && 'isSuccess' in response)
        ? response
        : { isSuccess: true, data: response }

      if (result.isSuccess) {
        requestCache.set(cacheKey, { data: result, timestamp: Date.now() })
      }
      pendingRequests.delete(cacheKey)
      return result
    })
    .catch((error) => {
      pendingRequests.delete(cacheKey)
      throw error
    })

  pendingRequests.set(cacheKey, requestPromise)
  return requestPromise
}

export const $post = <T>(url: string, body?: unknown, options?: FetchOptions) =>
  api<any>(url, { method: 'POST', body, ...options }).then(response => {
    return (response && typeof response === 'object' && 'isSuccess' in response)
      ? response as ApiResponse<T>
      : { isSuccess: true, data: response } as ApiResponse<T>
  })

export const $delete = <T>(url: string, options?: FetchOptions) =>
  api<any>(url, { method: 'DELETE', ...options }).then(response => {
    return (response && typeof response === 'object' && 'isSuccess' in response)
      ? response as ApiResponse<T>
      : { isSuccess: true, data: response } as ApiResponse<T>
  })


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
}

export default api
