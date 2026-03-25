import { logger } from '@/utils/logger'
import { toError } from '../runtime'
import type { RequestOptimizationConfig } from '../types'
import type { NetworkDetector } from '../networkDetector'
import { REQUEST_OPTIMIZATION_CONFIGS } from './config'
import {
  createRequestTimeoutPromise,
  reportRetryFailure,
  reportRetrySuccess,
  waitForRetryDelay,
} from './retry'

export class RequestOptimizer {
  private pendingRequests = new Map<string, Promise<unknown>>()

  constructor(private readonly networkDetector: NetworkDetector) {}

  async requestWithRetry<T>(
    requestFn: () => Promise<T>,
    options?: Partial<RequestOptimizationConfig>
  ): Promise<T> {
    const networkQuality = this.networkDetector.getNetworkQuality()
    const config = { ...REQUEST_OPTIMIZATION_CONFIGS[networkQuality], ...options }

    let lastError: Error | null = null

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        const result = await Promise.race([
          requestFn(),
          createRequestTimeoutPromise(config.timeout),
        ])

        reportRetrySuccess(networkQuality, attempt)
        return result
      } catch (error: unknown) {
        lastError = toError(error)

        if (attempt === config.maxRetries) {
          reportRetryFailure(networkQuality, config.maxRetries, lastError.message)
          break
        }

        await waitForRetryDelay(error, attempt, config, lastError.message)
      }
    }

    throw lastError || new Error('Request failed after all retries')
  }

  async deduplicateRequest<T>(key: string, requestFn: () => Promise<T>): Promise<T> {
    if (this.pendingRequests.has(key)) {
      logger.debug(`Request deduplicated: ${key}`)
      return this.pendingRequests.get(key) as Promise<T>
    }

    const requestPromise = this.requestWithRetry(requestFn).finally(() => {
      this.pendingRequests.delete(key)
    })

    this.pendingRequests.set(key, requestPromise)
    return requestPromise
  }

  getPendingRequestCount(): number {
    return this.pendingRequests.size
  }
}
