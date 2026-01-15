import { ofetch, type FetchOptions } from 'ofetch'
import { API_CACHE_TTL, API_TIMEOUT, API_MAX_RETRIES, API_RETRY_DELAY_MULTIPLIER } from '@/constants/api'
import { apiCache, createCacheKey } from '@/utils/cacheManager'
import { requestOptimizer, networkDetector } from '@/utils/networkOptimizer'
import { offlineManager, offlineContentServer } from '@/utils/offlineManager'

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
  'Unauthorized': '登录已过期，请重新登录',
  'Forbidden': '没有权限访问此资源',
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

// 将 HTTP 状态码转换为用户友好的消息
function translateHttpError(status: number, error?: unknown): string {
  const errorMsg = error instanceof Error ? error.message : String(error)
  
  switch (status) {
    case 400:
      return '请求参数错误，请检查后重试'
    case 401:
      return '登录已过期，请重新登录'
    case 403:
      return '没有权限访问此资源'
    case 404:
      return '请求的资源不存在'
    case 408:
      return '请求超时，请稍后重试'
    case 429:
      return '请求过于频繁，请稍后再试'
    case 500:
      return '服务器内部错误，请稍后重试'
    case 502:
      return '服务器暂时不可用，请稍后重试'
    case 503:
      return '服务正在维护中，请稍后重试'
    case 504:
      return '服务器响应超时，请稍后重试'
    default:
      return translateErrorMessage(errorMsg) || `请求失败 (${status})`
  }
}

// 导入性能监控
let performanceMonitor: any = null
try {
  // 动态导入以避免循环依赖
  import('../composables/usePerformanceMonitor').then(module => {
    const { useGlobalPerformanceMonitor } = module
    performanceMonitor = useGlobalPerformanceMonitor()
  })
} catch (e) {
  console.warn('Performance monitoring not available:', e)
}

// API 响应类型
export interface ApiResponse<T = unknown> {
  isSuccess: boolean
  data: T
  errorMsg?: string
}

// 缓存配置
const MAX_CACHE_SIZE = 1000

// 请求缓存 Map (LRU实现)
const requestCache = new Map<string, { data: unknown; timestamp: number }>()

// 请求去重 Map
const pendingRequests = new Map<string, Promise<unknown>>()

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
    // 记录请求开始时间
    const startTime = performance.now()
    ;(options as any)._startTime = startTime

    const token = localStorage.getItem('nexus_auth_token')
    if (token) {
      // Use Authorization header instead of URL params for better security
      options.headers = { 
        ...options.headers, 
        'Authorization': `Bearer ${token}` 
      }
    }
  },
  onResponse({ response, options }) {
    // 监控 API 响应时间
    const startTime = (options as any)._startTime
    if (startTime && performanceMonitor) {
      const responseTime = performance.now() - startTime
      const endpoint = new URL(response.url).pathname
      performanceMonitor.reportApiResponse(endpoint, responseTime, response.status)
    }

    // 业务级别错误拦截 (如果 isSuccess 为 false)
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
    // 监控错误响应时间
    const startTime = (options as any)._startTime
    if (startTime && performanceMonitor) {
      const responseTime = performance.now() - startTime
      const endpoint = new URL(response.url).pathname
      performanceMonitor.reportApiResponse(endpoint, responseTime, response.status)
    }

    // 系统级别错误拦截 (非 2xx 响应)
    const silent = (options as any).silent === true

    if (response.status === 401) {
      // 处理鉴权失效
      localStorage.removeItem('nexus_auth_token')
    }

    if (response.status >= 400 && !silent) {
      try {
        const handler = getGlobalErrorHandler()
        // 将 HTTP 错误转换为用户友好的消息
        const userFriendlyMessage = translateHttpError(response.status, error)
        handler.handleError(userFriendlyMessage, `请求失败 (${response.status})`, true)
      } catch (e) {
        // 使用 logger 而不是 console.error
        if (import.meta.env.DEV) {
          console.error('[API Interceptor] Global error handler failed', e)
        }
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
    return offlineContentServer.serveFromCache(cacheKey)
      .then(data => ({ isSuccess: true, data } as ApiResponse<T>))
      .catch(() => {
        throw new Error('Content not available offline')
      })
  }

  // 尝试从新的缓存管理器获取
  const cached = apiCache.get(cacheKey)
  if (cached) {
    return Promise.resolve(cached as ApiResponse<T>)
  }

  // 使用请求优化器进行去重请求
  return requestOptimizer.deduplicateRequest(cacheKey, async () => {
    const response = await internalFetch<any>(url, { ...options, method })
    
    // 适配 Nexus-lite: 如果已经是包装后的格式则直接返回，否则手动包装
    const result: ApiResponse<T> = (response && typeof response === 'object' && 'isSuccess' in response)
      ? response
      : { isSuccess: true, data: response }

    if (result.isSuccess) {
      // 使用新的缓存管理器
      apiCache.set(cacheKey, result, API_CACHE_TTL)
      
      // 缓存到离线管理器（用于离线访问）
      offlineManager.cacheContent({
        id: cacheKey,
        type: 'api-response',
        url,
        data: result,
        size: JSON.stringify(result).length * 2,
        priority: 5
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
      maxRetries: 3
    })
    return Promise.resolve({ isSuccess: true, data: null } as ApiResponse<T>)
  }

  return requestOptimizer.requestWithRetry(() => 
    api<any>(url, { method: 'POST', body, ...options })
  ).then(response => {
    // Clear cache on POST as it typically modifies state
    apiCache.clear()
    return (response && typeof response === 'object' && 'isSuccess' in response)
      ? response as ApiResponse<T>
      : { isSuccess: true, data: response } as ApiResponse<T>
  })
}

export const $patch = <T>(url: string, body?: unknown, options?: FetchOptions) => {
  // 如果离线，将操作加入队列
  if (!networkDetector.getNetworkInfo().isOnline) {
    offlineManager.queueOperation({
      type: 'api-request',
      method: 'PATCH',
      url,
      data: body,
      maxRetries: 3
    })
    return Promise.resolve({ isSuccess: true, data: null } as ApiResponse<T>)
  }

  return requestOptimizer.requestWithRetry(() => 
    api<any>(url, { method: 'PATCH', body, ...options })
  ).then(response => {
    apiCache.clear()
    return (response && typeof response === 'object' && 'isSuccess' in response)
      ? response as ApiResponse<T>
      : { isSuccess: true, data: response } as ApiResponse<T>
  })
}

export const $put = <T>(url: string, body?: unknown, options?: FetchOptions) => {
  // 如果离线，将操作加入队列
  if (!networkDetector.getNetworkInfo().isOnline) {
    offlineManager.queueOperation({
      type: 'api-request',
      method: 'PUT',
      url,
      data: body,
      maxRetries: 3
    })
    return Promise.resolve({ isSuccess: true, data: null } as ApiResponse<T>)
  }

  return requestOptimizer.requestWithRetry(() => 
    api<any>(url, { method: 'PUT', body, ...options })
  ).then(response => {
    apiCache.clear()
    return (response && typeof response === 'object' && 'isSuccess' in response)
      ? response as ApiResponse<T>
      : { isSuccess: true, data: response } as ApiResponse<T>
  })
}

export const $delete = <T>(url: string, options?: FetchOptions) => {
  // 如果离线，将操作加入队列
  if (!networkDetector.getNetworkInfo().isOnline) {
    offlineManager.queueOperation({
      type: 'api-request',
      method: 'DELETE',
      url,
      maxRetries: 3
    })
    return Promise.resolve({ isSuccess: true, data: null } as ApiResponse<T>)
  }

  return requestOptimizer.requestWithRetry(() => 
    api<any>(url, { method: 'DELETE', ...options })
  ).then(response => {
    apiCache.clear()
    return (response && typeof response === 'object' && 'isSuccess' in response)
      ? response as ApiResponse<T>
      : { isSuccess: true, data: response } as ApiResponse<T>
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
  apiCache.clear()
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
    legacy: {
      size: requestCache.size,
      pending: pendingRequests.size
    },
    modern: apiCache.getStats()
  }
}

export default api
