import type { ErrorContext } from '../core'
import type { ErrorInfo } from './types'

export async function withProcessedRetry<T>(
  operation: () => Promise<T>,
  processError: (error: unknown, context?: ErrorContext) => ErrorInfo,
  options: {
    maxAttempts?: number
    delay?: number
    backoff?: 'linear' | 'exponential'
  } = {},
): Promise<T> {
  const { maxAttempts = 3, delay = 1000, backoff = 'exponential' } = options
  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      const info = processError(error)

      if (!info.retryable || attempt === maxAttempts) {
        throw error
      }

      const waitTime =
        backoff === 'exponential'
          ? delay * Math.pow(2, attempt - 1)
          : delay * attempt

      await new Promise(resolve => setTimeout(resolve, waitTime))
    }
  }

  throw lastError
}
