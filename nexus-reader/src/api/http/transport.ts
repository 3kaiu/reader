import { ofetch } from 'ofetch'
import {
  API_TIMEOUT,
  API_MAX_RETRIES,
  API_RETRY_DELAY_MULTIPLIER,
} from '@/constants/api'
import {
  isLikelyNetworkOrCorsError,
} from './errors'
import {
  attachAuthHeaders,
  attachMessagePackHeaders,
  attachRequestMetadata,
  resolveBaseUrl,
} from './transport/request'
import {
  decodeMessagePackResponse,
  handleBusinessResponse,
  handleHttpResponseError,
} from './transport/response'
import { recordApiMetric } from './transport/metrics'
import type { ApiInterceptorResponse } from './transport/types'
import type { ApiFetchOptions, InternalApiFetchOptions } from './types'

const internalFetch = ofetch.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: API_TIMEOUT,
  retry: API_MAX_RETRIES,
  retryDelay: API_RETRY_DELAY_MULTIPLIER,
  retryStatusCodes: [408, 500, 502, 503, 504],
  onRequest({ options, request }) {
    const requestOptions = options as InternalApiFetchOptions
    const requestUrl = request.toString()

    resolveBaseUrl(requestOptions, requestUrl)
    attachRequestMetadata(requestOptions, requestUrl)
    attachAuthHeaders(requestOptions)
    attachMessagePackHeaders(requestOptions)
  },
  onResponse({ response, options }) {
    const requestOptions = options as InternalApiFetchOptions
    if (requestOptions._startTime) {
      const responseTime = performance.now() - requestOptions._startTime
      recordApiMetric(response.url, requestOptions, responseTime, 'api_response_ms', response.status)
    }

    decodeMessagePackResponse(response as ApiInterceptorResponse<unknown>)
    handleBusinessResponse(response as ApiInterceptorResponse<unknown>, requestOptions)
  },
  onResponseError({ response, error, options }) {
    const requestOptions = options as InternalApiFetchOptions
    if (response && requestOptions._startTime) {
      const responseTime = performance.now() - requestOptions._startTime
      recordApiMetric(response.url, requestOptions, responseTime, 'api_error_duration', response.status)
    }

    handleHttpResponseError(response as ApiInterceptorResponse<unknown> | undefined, error, requestOptions)
  },
})

export async function requestWithDirectFallback<T>(
  url: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const requestOptions = options as InternalApiFetchOptions

  try {
    return await internalFetch<T>(url, requestOptions)
  } catch (error) {
    const directBaseUrl = import.meta.env.VITE_NEXUS_LITE_DIRECT_URL || ''
    const usedDirect = requestOptions._usedDirect === true
    const alreadyTriedFallback = requestOptions._directFallbackTried === true

    if (
      !directBaseUrl ||
      !usedDirect ||
      alreadyTriedFallback ||
      !isLikelyNetworkOrCorsError(error)
    ) {
      throw error
    }

    const fallbackOptions: InternalApiFetchOptions = {
      ...requestOptions,
      forceEdge: true,
      _directFallbackTried: true,
    }

    return await internalFetch<T>(url, fallbackOptions)
  }
}
