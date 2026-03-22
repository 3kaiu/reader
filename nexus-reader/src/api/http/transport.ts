import { ofetch } from 'ofetch'
import { decode, encode } from '@/utils/msgpack'
import {
  API_TIMEOUT,
  API_MAX_RETRIES,
  API_RETRY_DELAY_MULTIPLIER,
} from '@/constants/api'
import { perfMonitor } from '@/services/performance/monitor'
import { resolveRoutePolicy } from '@/api/route-policy'
import { reportError } from '@/utils/errors'
import { logger } from '@/utils/logger'
import { clearAuthToken, getAuthToken } from '@/utils/authStorage'
import {
  convertToNexusError,
  isLikelyNetworkOrCorsError,
  reportBusinessError,
  reportRequestError,
} from './errors'
import type { ApiFetchOptions, InternalApiFetchOptions } from './types'

function mergeHeaders(
  headers: InternalApiFetchOptions['headers'],
  nextHeaders: Record<string, string>
): Record<string, string> {
  return {
    ...((headers as Record<string, string> | undefined) || {}),
    ...nextHeaders,
  }
}

function getObservedRoute(options: InternalApiFetchOptions): 'direct' | 'edge' {
  return options._usedDirect === true ? 'direct' : 'edge'
}

function resolveBaseUrl(options: InternalApiFetchOptions, requestUrl: string): void {
  const edgeBaseUrl = import.meta.env.VITE_API_URL || '/api'
  const directBaseUrl = import.meta.env.VITE_NEXUS_LITE_DIRECT_URL || ''
  const directApiKey = import.meta.env.VITE_NEXUS_LITE_API_KEY || ''
  const isAbsolute = /^https?:\/\//i.test(requestUrl)
  const routePolicy = !isAbsolute
    ? resolveRoutePolicy(requestUrl)
    : { supportsDirect: false, edgeOnly: false }

  if (options.forceEdge === true) {
    options.baseURL = edgeBaseUrl
    options._usedDirect = false
    return
  }

  const shouldUseDirect =
    Boolean(directBaseUrl) && !isAbsolute && routePolicy.supportsDirect && !routePolicy.edgeOnly

  if (!shouldUseDirect) {
    options.baseURL = edgeBaseUrl
    options._usedDirect = false
    return
  }

  options.baseURL = directBaseUrl
  options._usedDirect = true

  if (directApiKey) {
    options.headers = mergeHeaders(options.headers, {
      'X-API-Key': directApiKey,
    })
  }
}

function attachRequestMetadata(options: InternalApiFetchOptions, requestUrl: string): void {
  options._startTime = performance.now()
  options._requestUrl = requestUrl
  options._method = options.method || 'GET'
  options._directFallbackTried = options._directFallbackTried === true
  options._requestId = crypto.randomUUID()
  options.headers = mergeHeaders(options.headers, {
    'X-Request-ID': options._requestId,
  })
}

function attachAuthHeaders(options: InternalApiFetchOptions): void {
  const token = getAuthToken()
  if (!token) {
    return
  }

  options.headers = mergeHeaders(options.headers, {
    Authorization: `Bearer ${token}`,
  })
}

function attachMessagePackHeaders(options: InternalApiFetchOptions): void {
  if (!options.msgpack || !options.body) {
    return
  }

  options.body = encode(options.body)
  options.headers = mergeHeaders(options.headers, {
    'Content-Type': 'application/x-msgpack',
    Accept: 'application/x-msgpack',
  })
}

function recordApiMetric(
  responseUrl: string,
  options: InternalApiFetchOptions,
  responseTime: number,
  metricName: 'api_response_ms' | 'api_error_duration',
  status: number
): void {
  const endpoint = new URL(responseUrl).pathname
  const route = getObservedRoute(options)
  const method = options._method || 'GET'

  perfMonitor.record({
    name: 'api_route',
    value: 1,
    unit: 'ms',
    tags: {
      endpoint,
      status,
      route,
      method,
    },
  })

  perfMonitor.record({
    name: metricName,
    value: Number(responseTime.toFixed(2)),
    unit: 'ms',
    tags:
      metricName === 'api_error_duration'
        ? {
            status,
            endpoint,
            url: options._requestUrl || responseUrl,
            method,
            route,
          }
        : {
            endpoint,
            status,
            route,
            method,
          },
  })
}

function decodeMessagePackResponse(response: any): void {
  const contentType = response.headers.get('content-type')
  if (contentType !== 'application/x-msgpack') {
    return
  }

  try {
    const buffer = response._data
    if (buffer instanceof Uint8Array || buffer instanceof ArrayBuffer) {
      response._data = decode(new Uint8Array(buffer))
    }
  } catch (error) {
    logger.error('Failed to decode MessagePack response', { error })
  }
}

function handleBusinessResponse(response: any, options: InternalApiFetchOptions): void {
  const data = response._data
  if (!data || typeof data !== 'object' || data.isSuccess !== false || options.silent === true) {
    return
  }

  reportBusinessError(data.errorMsg)
}

function handleHttpResponseError(
  response: any,
  error: unknown,
  options: InternalApiFetchOptions
): void {
  if (!response) {
    return
  }

  if (response.status === 401) {
    clearAuthToken()
  }

  if (response.status < 400 || options.silent === true) {
    return
  }

  const url = options._requestUrl || response.url
  const method = options._method || 'GET'
  const nexusError = convertToNexusError(
    {
      status: response.status,
      message: (error as any)?.message || response.statusText,
      response,
    },
    url,
    method
  )

  reportError(nexusError, {
    status: response.status,
    url,
    method,
    responseData: response._data,
  })

  reportRequestError(nexusError)
}

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

    decodeMessagePackResponse(response)
    handleBusinessResponse(response, requestOptions)
  },
  onResponseError({ response, error, options }) {
    const requestOptions = options as InternalApiFetchOptions
    if (response && requestOptions._startTime) {
      const responseTime = performance.now() - requestOptions._startTime
      recordApiMetric(response.url, requestOptions, responseTime, 'api_error_duration', response.status)
    }

    handleHttpResponseError(response, error, requestOptions)
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
