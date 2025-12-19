import { ofetch, type FetchOptions } from 'ofetch'
import { useUserStore } from '@/stores/user'

// API 响应类型
export interface ApiResponse<T = unknown> {
  isSuccess: boolean
  data: T
  errorMsg?: string
}

// 创建 ofetch 实例
export const api = ofetch.create({
  baseURL: import.meta.env.VITE_API_URL || '/reader3',
  timeout: 5 * 60 * 1000,

  // 请求拦截器
  onRequest({ options }) {
    const userStore = useUserStore()
    if (userStore.token) {
      options.params = { ...options.params, accessToken: userStore.token }
    }
    // 防止 IE 缓存
    options.params = { ...options.params, v: Date.now() }
  },

  // 响应拦截器
  onResponseError({ response }) {
    if (response._data?.data === 'NEED_LOGIN') {
      const userStore = useUserStore()
      userStore.showLoginModal = true
    }
  },
})

// 便捷方法
export const $get = <T>(url: string, options?: FetchOptions) =>
  api<ApiResponse<T>>(url, { method: 'GET', ...options })

export const $post = <T>(url: string, body?: unknown, options?: FetchOptions) =>
  api<ApiResponse<T>>(url, { method: 'POST', body, ...options })

export default api
