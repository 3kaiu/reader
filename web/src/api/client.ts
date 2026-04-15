import type { ApiFetchOptions, ApiResponse } from './http/types'
import { clearApiResponseCache } from './http/cache'
import { requestWithDirectFallback } from './http/transport'
import { normalizeApiResponse } from './http/types'

export type { ApiFetchOptions, ApiResponse } from './http/types'

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
  return requestWithDirectFallback<unknown>(url, { ...options, method }).then(
    normalizeApiResponse<T>
  )
}

export const $post = <T>(url: string, body?: unknown, options?: ApiFetchOptions) => {
  return requestMutation<T>('POST', url, body, options)
}

export const $put = <T>(url: string, body?: unknown, options?: ApiFetchOptions) => {
  return requestMutation<T>('PUT', url, body, options)
}

export const $delete = <T>(url: string, options?: ApiFetchOptions) => {
  return requestMutation<T>('DELETE', url, undefined, options)
}

export const $patch = <T>(url: string, body?: unknown, options?: ApiFetchOptions) => {
  return requestMutation<T>('PATCH', url, body, options)
}
