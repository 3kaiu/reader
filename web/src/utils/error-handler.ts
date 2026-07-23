import { logger } from '@/utils/logger'
import type { ErrorContext } from '@/utils/errors'

interface ErrorEventRecord {
  id: string
  error: Error
  context: ErrorContext
  timestamp: number
  userAgent: string
  url: string
}

// Sanitize error context to remove potentially sensitive data
function sanitizeContext(context: ErrorContext): ErrorContext {
  const sanitized: ErrorContext = { ...context }
  // Redact any values that look like API keys, tokens, or secrets
  const sensitivePatterns = [/^api[-_]?key$/i, /^secret/i, /^token$/i, /^password$/i, /^authorization$/i]
  for (const [key, value] of Object.entries(sanitized)) {
    if (sensitivePatterns.some((p) => p.test(key))) {
      sanitized[key] = '[REDACTED]'
    }
  }
  return sanitized
}

export class UnifiedErrorHandler {
  private static instance: UnifiedErrorHandler
  private errorQueue: ErrorEventRecord[] = []
  private maxQueueSize = 100

  private constructor() {}

  static getInstance(): UnifiedErrorHandler {
    if (!UnifiedErrorHandler.instance) {
      UnifiedErrorHandler.instance = new UnifiedErrorHandler()
    }
    return UnifiedErrorHandler.instance
  }

  handle(error: Error | string, context?: ErrorContext): void {
    const errorEvent: ErrorEventRecord = {
      id: crypto.randomUUID(),
      error: typeof error === 'string' ? new Error(error) : error,
      context: sanitizeContext(context || {}),
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    }

    this.errorQueue.push(errorEvent)
    if (this.errorQueue.length > this.maxQueueSize) {
      this.errorQueue.shift()
    }

    logger.error('Unified Error Handler', errorEvent)
    void this.reportToMonitoring(errorEvent)
  }

  getErrors(limit = 10): ErrorEventRecord[] {
    return this.errorQueue.slice(-limit)
  }

  clearErrors(): void {
    this.errorQueue = []
  }

  private async reportToMonitoring(errorEvent: ErrorEventRecord): Promise<void> {
    try {
      // Attach API key if available for monitoring endpoint auth
      const apiKey = localStorage.getItem('api_key')
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (apiKey) {
        headers['X-API-Key'] = apiKey
      }

      await fetch('/api/errors', {
        method: 'POST',
        headers,
        body: JSON.stringify(errorEvent),
      })
    } catch (error) {
      logger.warn('Failed to report error to monitoring', { error })
    }
  }
}

export const errorHandler = UnifiedErrorHandler.getInstance()
