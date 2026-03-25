import type {
  NavigatorWithConnection,
  NetworkConnectionLike,
  PerformanceMetricContext,
  PerformanceMonitorLike,
  RetryableErrorLike,
  RetryableResponseLike,
} from './types'

export function getNavigatorConnection(): NetworkConnectionLike | undefined {
  if (typeof navigator === 'undefined') {
    return undefined
  }

  return (navigator as NavigatorWithConnection).connection
}

export function getPerformanceMonitor(): PerformanceMonitorLike | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  return window.performanceMonitor
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }

  return String(error ?? 'Unknown error')
}

export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(getErrorMessage(error))
}

function getHeaderValue(
  headers: RetryableResponseLike['headers'],
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

  const headerBag = headers as Record<string, unknown>
  const value = headerBag[headerName] ?? headerBag[headerName.toLowerCase()]
  return typeof value === 'string' ? value : undefined
}

export function getRetryAfterHeader(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined
  }

  const errorLike = error as RetryableErrorLike
  return getHeaderValue(errorLike.response?.headers, 'retry-after')
}

declare global {
  interface Window {
    performanceMonitor?: {
      reportMetric: (name: string, value: number, context?: PerformanceMetricContext) => void
    }
  }
}

export {}
