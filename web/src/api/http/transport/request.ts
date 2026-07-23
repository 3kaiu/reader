import { resolveRoutePolicy } from '@/api/route-policy'
import type { InternalApiFetchOptions } from '../types'

export function mergeHeaders(
  headers: InternalApiFetchOptions['headers'],
  nextHeaders: Record<string, string>
): Record<string, string> {
  return {
    ...((headers as Record<string, string> | undefined) || {}),
    ...nextHeaders,
  }
}

export function resolveBaseUrl(options: InternalApiFetchOptions, requestUrl: string): void {
  const edgeBaseUrl = import.meta.env.VITE_API_URL || '/api'
  const directBaseUrl = import.meta.env.VITE_NEXUS_LITE_DIRECT_URL || ''
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
}

export function attachRequestMetadata(options: InternalApiFetchOptions, requestUrl: string): void {
  options._startTime = performance.now()
  options._requestUrl = requestUrl
  options._method = options.method || 'GET'
  options._directFallbackTried = options._directFallbackTried === true
  // Preserve request id across retries / fallback to make idempotency effective.
  options._requestId = options._requestId || crypto.randomUUID()
  options.headers = mergeHeaders(options.headers, {
    'X-Request-ID': options._requestId,
  })
}

export function attachMessagePackHeaders(options: InternalApiFetchOptions): void {
  // MessagePack transport disabled — backend does not support it.
  // The msgpack? flag on ApiFetchOptions is retained for forward-compatibility only.
}

export function attachApiKeyHeader(options: InternalApiFetchOptions): void {
  const apiKey = localStorage.getItem('api_key')
  if (apiKey) {
    options.headers = mergeHeaders(options.headers, { 'X-API-Key': apiKey })
  }
}
