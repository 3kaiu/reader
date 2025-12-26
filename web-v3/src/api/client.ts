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
const requestCache = new Map<string, { data: any; timestamp: number }>()

// 请求去重 Map
const pendingRequests = new Map<string, Promise<any>>()

// 创建内部原始 ofetch 实例（用于避免递归调用）
// 这个实例不包含缓存和去重逻辑，只处理认证和基础配置
const internalFetch = ofetch.create({
  baseURL: import.meta.env.VITE_API_URL || '/reader3',
  timeout: API_TIMEOUT,
  onRequest({ options }) {
    const userStore = useUserStore()
    if (userStore.token) {
      options.params = { ...options.params, accessToken: userStore.token }
    }
    // 防止 IE 缓存
    options.params = { ...options.params, v: Date.now() }
  },
})

// 创建对外暴露的 ofetch 实例（包含缓存和去重逻辑）
export const api = ofetch.create({
  baseURL: import.meta.env.VITE_API_URL || '/reader3',
  timeout: API_TIMEOUT,

  // 请求拦截器
  onRequest({ options, request }) {
    const userStore = useUserStore()
    if (userStore.token) {
      options.params = { ...options.params, accessToken: userStore.token }
    }
    
    // 防止 IE 缓存
    options.params = { ...options.params, v: Date.now() }
    
    // GET 请求缓存和去重处理
    if (options.method === 'GET') {
      const cacheKey = `${String(request)}_${JSON.stringify(options.params)}`
      const cached = requestCache.get(cacheKey)
      
      // 检查缓存
      if (cached && Date.now() - cached.timestamp < API_CACHE_TTL) {
        // 返回缓存的 Promise
        return Promise.resolve(cached.data)
      }
      
      // 请求去重：如果已有相同请求在进行中，复用该请求
      if (pendingRequests.has(cacheKey)) {
        return pendingRequests.get(cacheKey)!
      }
      
      // 使用内部实例发送请求，避免递归调用
      const requestPromise = internalFetch<ApiResponse>(request, options)
        .then((response) => {
          // 缓存成功的响应
          if (response.isSuccess) {
            requestCache.set(cacheKey, { data: response, timestamp: Date.now() })
          }
          pendingRequests.delete(cacheKey)
          return response
        })
        .catch((error) => {
          pendingRequests.delete(cacheKey)
          throw error
        })
      
      pendingRequests.set(cacheKey, requestPromise)
      return requestPromise
    }
  },

  // 响应拦截器
  onResponse({ response }) {
    // 缓存成功的 GET 请求
    if (response._data?.isSuccess && response.request?.method === 'GET') {
      const cacheKey = `${response.url}_${JSON.stringify(response.request?.params)}`
      requestCache.set(cacheKey, {
        data: response._data,
        timestamp: Date.now(),
      })
    }
  },

  // 错误响应拦截器
  onResponseError({ response, request }) {
    if (response._data?.data === 'NEED_LOGIN') {
      const userStore = useUserStore()
      userStore.showLoginModal = true
    }
    
    // 自动重试逻辑（仅对网络错误，最多重试3次）
    const retryCount = (request as any).retryCount || 0
    if (!response.status && retryCount < API_MAX_RETRIES) {
      ;(request as any).retryCount = retryCount + 1
      // 延迟重试：1s, 2s, 4s（指数退避）
      const delay = Math.pow(2, retryCount) * API_RETRY_DELAY_MULTIPLIER
      return new Promise((resolve) => {
        setTimeout(() => {
          // 使用内部实例重试，避免递归调用
          resolve(internalFetch(request, { retry: retryCount + 1 }))
        }, delay)
      })
    }
  },
})

// 便捷方法
export const $get = <T>(url: string, options?: FetchOptions) =>
  api<ApiResponse<T>>(url, { method: 'GET', ...options })

export const $post = <T>(url: string, body?: unknown, options?: FetchOptions) =>
  api<ApiResponse<T>>(url, { method: 'POST', body, ...options })

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
