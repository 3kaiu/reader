import { ErrorCode, NexusError } from '@/utils/errors'
import { translateErrorMessage } from './messages'
import type { ErrorResponseLike, HeaderBag, HttpErrorLike } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function normalizeHttpError(error: unknown): HttpErrorLike {
  if (isRecord(error)) {
    return error as HttpErrorLike
  }

  if (error instanceof Error) {
    return error
  }

  return {
    message: typeof error === 'string' ? error : String(error ?? ''),
    toString: () => String(error ?? ''),
  }
}

export function getHeaderValue(
  headers: ErrorResponseLike['headers'],
  headerName: string
): string | undefined {
  if (!headers) {
    return undefined
  }

  if (headers instanceof Headers) {
    return headers.get(headerName) ?? headers.get(headerName.toLowerCase()) ?? undefined
  }

  if (typeof headers.get === 'function') {
    const value = headers.get(headerName) ?? headers.get(headerName.toLowerCase())
    return typeof value === 'string' ? value : undefined
  }

  const headerBag = headers as HeaderBag
  const directValue = headerBag[headerName] ?? headerBag[headerName.toLowerCase()]
  return typeof directValue === 'string' ? directValue : undefined
}

function parseBackendErrorPayload(response?: ErrorResponseLike): {
  code?: string
  message?: string
  details?: string
} | null {
  const data = response?._data
  if (!isRecord(data)) {
    return null
  }

  return {
    code: typeof data.code === 'string' ? data.code : undefined,
    message:
      typeof data.message === 'string'
        ? data.message
        : typeof data.error === 'string'
          ? data.error
          : undefined,
    details: typeof data.details === 'string' ? data.details : undefined,
  }
}

export function convertToNexusError(error: unknown, url: string, method: string): NexusError {
  if (error instanceof NexusError) {
    return error
  }

  const normalizedError = normalizeHttpError(error)
  const backendPayload = parseBackendErrorPayload(normalizedError.response)
  const backendMessage = backendPayload?.message
  const backendDetails = backendPayload?.details
  const errorMessage = normalizedError.message || '未知错误'
  const errorString = normalizedError.toString?.() || String(error ?? '')

  if (normalizedError.name === 'AbortError' || errorMessage.includes('timeout')) {
    return new NexusError(ErrorCode.TIMEOUT, '请求超时，请稍后重试', errorMessage, {
      url,
      method,
      originalError: errorString,
    })
  }

  if (errorMessage.includes('NetworkError') || errorMessage.includes('Failed to fetch')) {
    return new NexusError(
      ErrorCode.NETWORK_ERROR,
      '网络连接失败，请检查网络后重试',
      errorMessage,
      { url, method, originalError: errorString }
    )
  }

  if (normalizedError.status === 401) {
    return new NexusError(ErrorCode.UNAUTHORIZED, '登录已过期，请重新登录', backendDetails, {
      url,
      method,
      status: normalizedError.status,
      backendCode: backendPayload?.code,
    })
  }

  if (normalizedError.status === 403) {
    return new NexusError(ErrorCode.FORBIDDEN, '没有权限访问此资源', backendDetails, {
      url,
      method,
      status: normalizedError.status,
      backendCode: backendPayload?.code,
    })
  }

  if (normalizedError.status === 429) {
    return new NexusError(ErrorCode.RATE_LIMITED, '请求过于频繁，请稍后重试', backendDetails, {
      url,
      method,
      status: normalizedError.status,
      retryAfter: getHeaderValue(normalizedError.response?.headers, 'retry-after'),
      backendCode: backendPayload?.code,
    })
  }

  if ((normalizedError.status || 0) >= 500) {
    const userMessage = translateErrorMessage(backendMessage || errorMessage || '服务器内部错误')
    return new NexusError(
      ErrorCode.INTERNAL_ERROR,
      userMessage,
      backendDetails || backendMessage || errorMessage,
      {
        url,
        method,
        status: normalizedError.status,
        backendCode: backendPayload?.code,
      }
    )
  }

  return new NexusError(
    ErrorCode.UNKNOWN_ERROR,
    translateErrorMessage(backendMessage || errorMessage || '未知错误'),
    backendDetails || backendMessage || errorMessage,
    { url, method, originalError: errorString, backendCode: backendPayload?.code }
  )
}

export function isLikelyNetworkOrCorsError(error: unknown): boolean {
  const normalizedError = normalizeHttpError(error)
  const message = String(normalizedError.message || error || '')
  return (
    normalizedError.name === 'AbortError' ||
    message.includes('Failed to fetch') ||
    message.includes('NetworkError') ||
    (message.toLowerCase().includes('fetch') && message.toLowerCase().includes('failed'))
  )
}
