import { logger } from '@/utils/logger'
import {
  getPerformanceMonitor,
  getRetryAfterHeader,
} from '../runtime'
import type {
  NetworkQuality,
  RequestOptimizationConfig,
} from '../types'

export function createRequestTimeoutPromise(timeout: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Request timeout')), timeout)
  })
}

export function reportRetrySuccess(networkQuality: NetworkQuality, attempt: number): void {
  const performanceMonitor = getPerformanceMonitor()
  if (!performanceMonitor) {
    return
  }

  performanceMonitor.reportMetric('request_retry_success', attempt, {
    networkQuality,
    totalAttempts: attempt + 1,
  })
}

export function reportRetryFailure(
  networkQuality: NetworkQuality,
  maxRetries: number,
  errorMessage: string,
): void {
  const performanceMonitor = getPerformanceMonitor()
  if (!performanceMonitor) {
    return
  }

  performanceMonitor.reportMetric('request_retry_failed', maxRetries, {
    networkQuality,
    error: errorMessage,
  })
}

function getServerRetryDelay(error: unknown, maxDelay: number): number | null {
  const retryAfterHeader = getRetryAfterHeader(error)
  const retryAfterSeconds = retryAfterHeader
    ? Number.parseInt(String(retryAfterHeader), 10)
    : Number.NaN

  if (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds <= 0) {
    return null
  }

  return Math.min(retryAfterSeconds * 1000, maxDelay)
}

function getExponentialRetryDelay(
  attempt: number,
  config: RequestOptimizationConfig,
): number {
  const baseDelay = Math.min(config.baseDelay * Math.pow(2, attempt), config.maxDelay)
  const jitter = baseDelay * config.jitterFactor * Math.random()
  return baseDelay + jitter
}

function sleep(delay: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, delay))
}

export async function waitForRetryDelay(
  error: unknown,
  attempt: number,
  config: RequestOptimizationConfig,
  errorMessage: string,
): Promise<void> {
  const serverDelay = getServerRetryDelay(error, config.maxDelay)
  if (serverDelay !== null) {
    logger.debug('Retrying request after server Retry-After', {
      retryAfterSeconds: serverDelay / 1000,
      delay: serverDelay,
      attempt: attempt + 1,
    })
    await sleep(serverDelay)
    return
  }

  const delay = getExponentialRetryDelay(attempt, config)

  logger.debug('Request failed, scheduling retry', {
    attempt: attempt + 1,
    delay: Number(delay.toFixed(0)),
    error: errorMessage,
  })
  await sleep(delay)
}
