export interface ErrorContext {
  component?: string
  operation?: string
  userId?: string
  [key: string]: any
}

interface ErrorEventRecord {
  id: string
  error: Error
  context: ErrorContext
  timestamp: number
  userAgent: string
  url: string
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
      context: context || {},
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    }

    this.errorQueue.push(errorEvent)
    if (this.errorQueue.length > this.maxQueueSize) {
      this.errorQueue.shift()
    }

    console.error('Unified Error Handler:', errorEvent)
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
      await fetch('/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorEvent),
      })
    } catch (error) {
      console.warn('Failed to report error to monitoring:', error)
    }
  }
}

export const errorHandler = UnifiedErrorHandler.getInstance()
