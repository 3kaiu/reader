/**
 * 统一API客户端 - Unified API Client
 * 合并所有API调用逻辑，提供统一的请求处理、缓存、重试等功能
 */

import { ref, reactive } from 'vue'
import { logger } from './logger'
import { localStorage } from './coreUtils'

export interface ApiRequest {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  headers?: Record<string, string>
  body?: any
  params?: Record<string, any>
  timeout?: number
  retries?: number
  cache?: boolean | number // false 或缓存时间(秒)
  priority?: 'low' | 'normal' | 'high'
}

export interface ApiResponse<T = any> {
  data: T
  status: number
  headers: Record<string, string>
  cached: boolean
  timestamp: number
  requestId: string
}

export interface ApiError {
  message: string
  status: number
  code: string
  details?: any
  retryable: boolean
}

class ApiClient {
  private baseURL: string
  private defaultHeaders: Record<string, string>
  private requestQueue: Array<{ request: ApiRequest; resolve: Function; reject: Function; priority: number }> = []
  private activeRequests = new Map<string, AbortController>()
  private cache = new Map<string, { data: any; timestamp: number; expiry: number }>()
  private processing = false

  constructor(baseURL = '/api') {
    this.baseURL = baseURL
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  }

  // ===== 配置方法 =====

  setBaseURL(url: string): void {
    this.baseURL = url
  }

  setDefaultHeader(key: string, value: string): void {
    this.defaultHeaders[key] = value
  }

  setAuthToken(token: string): void {
    this.setDefaultHeader('Authorization', `Bearer ${token}`)
  }

  // ===== 主要API方法 =====

  async get<T = any>(url: string, options: Partial<ApiRequest> = {}): Promise<ApiResponse<T>> {
    return this.request<T>({ ...options, url, method: 'GET' })
  }

  async post<T = any>(url: string, data?: any, options: Partial<ApiRequest> = {}): Promise<ApiResponse<T>> {
    return this.request<T>({ ...options, url, method: 'POST', body: data })
  }

  async put<T = any>(url: string, data?: any, options: Partial<ApiRequest> = {}): Promise<ApiResponse<T>> {
    return this.request<T>({ ...options, url, method: 'PUT', body: data })
  }

  async delete<T = any>(url: string, options: Partial<ApiRequest> = {}): Promise<ApiResponse<T>> {
    return this.request<T>({ ...options, url, method: 'DELETE' })
  }

  async patch<T = any>(url: string, data?: any, options: Partial<ApiRequest> = {}): Promise<ApiResponse<T>> {
    return this.request<T>({ ...options, url, method: 'PATCH', body: data })
  }

  // ===== 核心请求方法 =====

  async request<T = any>(config: ApiRequest): Promise<ApiResponse<T>> {
    const requestId = this.generateRequestId()
    const fullConfig = this.mergeConfig(config)

    // 检查缓存
    if (fullConfig.cache !== false && fullConfig.method === 'GET') {
      const cached = this.getCachedResponse<T>(fullConfig.url)
      if (cached) {
        logger.debug(`Cache hit for ${fullConfig.url}`)
        return {
          ...cached,
          cached: true,
          requestId
        }
      }
    }

    // 添加到队列
    return new Promise((resolve, reject) => {
      const priority = this.getPriorityValue(fullConfig.priority)
      this.requestQueue.push({
        request: fullConfig,
        resolve: (response: ApiResponse<T>) => resolve({ ...response, requestId }),
        reject,
        priority
      })

      // 按优先级排序
      this.requestQueue.sort((a, b) => b.priority - a.priority)

      // 开始处理队列
      this.processQueue()
    })
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.requestQueue.length === 0) return

    this.processing = true

    while (this.requestQueue.length > 0) {
      const { request, resolve, reject } = this.requestQueue.shift()!

      try {
        const response = await this.executeRequest(request)
        resolve(response)
      } catch (error) {
        reject(error)
      }

      // 小延迟避免过快请求
      await new Promise(resolve => setTimeout(resolve, 10))
    }

    this.processing = false
  }

  private async executeRequest<T>(config: ApiRequest): Promise<ApiResponse<T>> {
    const url = this.buildURL(config.url, config.params)
    const controller = new AbortController()
    const requestKey = `${config.method}:${url}`

    // 存储控制器用于取消请求
    this.activeRequests.set(requestKey, controller)

    const headers = { ...this.defaultHeaders, ...config.headers }
    const timeout = config.timeout || 30000

    // 设置超时
    const timeoutId = setTimeout(() => {
      controller.abort()
    }, timeout)

    try {
      const fetchOptions: RequestInit = {
        method: config.method,
        headers,
        signal: controller.signal
      }

      if (config.body && typeof config.body === 'object') {
        fetchOptions.body = JSON.stringify(config.body)
      } else if (config.body) {
        fetchOptions.body = config.body
      }

      logger.debug(`API Request: ${config.method} ${url}`)

      const response = await fetch(url, fetchOptions)
      clearTimeout(timeoutId)

      if (!response.ok) {
        throw await this.createApiError(response)
      }

      const data = await this.parseResponse(response)
      const apiResponse: ApiResponse<T> = {
        data,
        status: response.status,
        headers: this.headersToObject(response.headers),
        cached: false,
        timestamp: Date.now(),
        requestId: ''
      }

      // 缓存响应
      if (config.cache !== false && config.method === 'GET') {
        const cacheTime = typeof config.cache === 'number' ? config.cache : 300 // 默认5分钟
        this.setCachedResponse(url, apiResponse, cacheTime)
      }

      return apiResponse

    } catch (error) {
      clearTimeout(timeoutId)

      if (error.name === 'AbortError') {
        throw new ApiError('Request timeout', 408, 'TIMEOUT', undefined, true)
      }

      throw error
    } finally {
      this.activeRequests.delete(requestKey)
    }
  }

  // ===== 缓存管理 =====

  private getCachedResponse<T>(url: string): ApiResponse<T> | null {
    const cached = this.cache.get(url)
    if (!cached) return null

    if (Date.now() > cached.expiry) {
      this.cache.delete(url)
      return null
    }

    return {
      ...cached.data,
      cached: true,
      timestamp: cached.timestamp
    }
  }

  private setCachedResponse(url: string, response: ApiResponse, ttlSeconds: number): void {
    const expiry = Date.now() + (ttlSeconds * 1000)
    this.cache.set(url, {
      data: response,
      timestamp: response.timestamp,
      expiry
    })

    // 限制缓存大小
    if (this.cache.size > 100) {
      const firstKey = this.cache.keys().next().value
      this.cache.delete(firstKey)
    }
  }

  clearCache(): void {
    this.cache.clear()
  }

  // ===== 错误处理 =====

  private async createApiError(response: Response): Promise<ApiError> {
    let message = 'API request failed'
    let details: any = null

    try {
      const errorData = await response.json()
      message = errorData.message || message
      details = errorData
    } catch (e) {
      message = response.statusText || message
    }

    const retryable = response.status >= 500 || response.status === 429

    return new ApiError(
      message,
      response.status,
      this.getErrorCode(response.status),
      details,
      retryable
    )
  }

  private getErrorCode(status: number): string {
    switch (status) {
      case 400: return 'BAD_REQUEST'
      case 401: return 'UNAUTHORIZED'
      case 403: return 'FORBIDDEN'
      case 404: return 'NOT_FOUND'
      case 429: return 'RATE_LIMITED'
      case 500: return 'INTERNAL_ERROR'
      case 502: return 'BAD_GATEWAY'
      case 503: return 'SERVICE_UNAVAILABLE'
      default: return 'UNKNOWN_ERROR'
    }
  }

  // ===== 工具方法 =====

  private mergeConfig(config: ApiRequest): ApiRequest {
    return {
      method: 'GET',
      timeout: 30000,
      retries: 0,
      cache: false,
      priority: 'normal',
      ...config,
      headers: { ...this.defaultHeaders, ...config.headers }
    }
  }

  private buildURL(url: string, params?: Record<string, any>): string {
    let fullUrl = url.startsWith('http') ? url : this.baseURL + url

    if (params && Object.keys(params).length > 0) {
      const searchParams = new URLSearchParams()
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value))
        }
      }
      const paramString = searchParams.toString()
      if (paramString) {
        fullUrl += (fullUrl.includes('?') ? '&' : '?') + paramString
      }
    }

    return fullUrl
  }

  private async parseResponse(response: Response): Promise<any> {
    const contentType = response.headers.get('content-type')

    if (contentType?.includes('application/json')) {
      return await response.json()
    } else if (contentType?.includes('text/')) {
      return await response.text()
    } else {
      return await response.arrayBuffer()
    }
  }

  private headersToObject(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {}
    headers.forEach((value, key) => {
      result[key] = value
    })
    return result
  }

  private getPriorityValue(priority: string = 'normal'): number {
    switch (priority) {
      case 'high': return 3
      case 'normal': return 2
      case 'low': return 1
      default: return 2
    }
  }

  private generateRequestId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36)
  }

  // ===== 批量操作 =====

  async batch(requests: ApiRequest[]): Promise<ApiResponse[]> {
    const promises = requests.map(request => this.request(request))
    return Promise.all(promises)
  }

  // ===== 取消请求 =====

  cancel(url: string, method = 'GET'): void {
    const requestKey = `${method}:${url}`
    const controller = this.activeRequests.get(requestKey)
    if (controller) {
      controller.abort()
      this.activeRequests.delete(requestKey)
    }
  }

  cancelAll(): void {
    for (const controller of this.activeRequests.values()) {
      controller.abort()
    }
    this.activeRequests.clear()
    this.requestQueue = []
  }

  // ===== 状态监控 =====

  getStats(): {
    activeRequests: number
    queuedRequests: number
    cacheSize: number
  } {
    return {
      activeRequests: this.activeRequests.size,
      queuedRequests: this.requestQueue.length,
      cacheSize: this.cache.size
    }
  }
}

// ===== 自定义错误类 =====

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public details?: any,
    public retryable: boolean = false
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// ===== 全局实例 =====

export const apiClient = new ApiClient()

// ===== 便捷方法 =====

export const api = {
  get: <T = any>(url: string, options?: Partial<ApiRequest>) => apiClient.get<T>(url, options),
  post: <T = any>(url: string, data?: any, options?: Partial<ApiRequest>) => apiClient.post<T>(url, data, options),
  put: <T = any>(url: string, data?: any, options?: Partial<ApiRequest>) => apiClient.put<T>(url, data, options),
  delete: <T = any>(url: string, options?: Partial<ApiRequest>) => apiClient.delete<T>(url, options),
  patch: <T = any>(url: string, data?: any, options?: Partial<ApiRequest>) => apiClient.patch<T>(url, data, options),
  batch: (requests: ApiRequest[]) => apiClient.batch(requests)
}

// ===== Vue 插件 =====

export const apiPlugin = {
  install(app: any) {
    app.config.globalProperties.$api = apiClient
    app.provide('api', apiClient)
  }
}

export default apiClient