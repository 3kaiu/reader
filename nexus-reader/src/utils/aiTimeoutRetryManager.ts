/**
 * AI Timeout and Retry Manager
 * Manages timeouts and retry logic for AI operations
 */

export interface RetryConfig {
  maxRetries: number
  baseDelay: number
  maxDelay: number
  backoffMultiplier: number
  timeout: number
}

export interface RetryResult<T> {
  success: boolean
  data?: T
  error?: Error
  attempts: number
  totalTime: number
}

export class AITimeoutRetryManager {
  private defaultConfig: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    timeout: 10000
  }

  private activeOperations = new Set<string>()
  private cancelledOperations = new Set<string>()
  private operationControllers = new Map<string, AbortController>()

  /**
   * Execute operation with timeout and retry logic
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {}
  ): Promise<RetryResult<T>> {
    const finalConfig = { ...this.defaultConfig, ...config }
    const startTime = Date.now()
    let lastError: Error | undefined
    
    for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
      try {
        const data = await this.executeWithTimeout(operation, finalConfig.timeout)
        
        return {
          success: true,
          data,
          attempts: attempt + 1,
          totalTime: Date.now() - startTime
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        
        // Don't retry on last attempt
        if (attempt === finalConfig.maxRetries) {
          break
        }
        
        // Calculate delay for next attempt
        const delay = Math.min(
          finalConfig.baseDelay * Math.pow(finalConfig.backoffMultiplier, attempt),
          finalConfig.maxDelay
        )
        
        // Wait before retry
        await this.delay(delay)
      }
    }
    
    return {
      success: false,
      error: lastError,
      attempts: finalConfig.maxRetries + 1,
      totalTime: Date.now() - startTime
    }
  }

  /**
   * Execute operation with timeout
   */
  private async executeWithTimeout<T>(
    operation: (signal?: AbortSignal) => Promise<T>,
    timeout: number,
    operationId?: string
  ): Promise<T> {
    const controller = new AbortController()
    
    // Store the controller if we have an operation ID
    if (operationId) {
      this.operationControllers.set(operationId, controller)
    }
    
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        controller.abort()
        reject(new Error(`Operation timed out after ${timeout}ms`))
      }, timeout)
      
      operation(controller.signal)
        .then(result => {
          clearTimeout(timeoutId)
          resolve(result)
        })
        .catch(error => {
          clearTimeout(timeoutId)
          reject(error)
        })
        .finally(() => {
          // Clean up the controller
          if (operationId) {
            this.operationControllers.delete(operationId)
          }
        })
    })
  }

  /**
   * Delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Check if error is retryable
   */
  isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase()
    
    // Retryable errors
    if (message.includes('timeout') ||
        message.includes('network') ||
        message.includes('connection') ||
        message.includes('rate limit') ||
        message.includes('503') ||
        message.includes('502') ||
        message.includes('504')) {
      return true
    }
    
    // Non-retryable errors
    if (message.includes('401') ||
        message.includes('403') ||
        message.includes('404') ||
        message.includes('invalid') ||
        message.includes('malformed')) {
      return false
    }
    
    return true
  }

  /**
   * Get recommended delay for error type
   */
  getRecommendedDelay(error: Error): number {
    const message = error.message.toLowerCase()
    
    if (message.includes('rate limit')) {
      return 60000 // 1 minute for rate limits
    }
    
    if (message.includes('timeout')) {
      return 5000 // 5 seconds for timeouts
    }
    
    if (message.includes('network')) {
      return 2000 // 2 seconds for network errors
    }
    
    return this.defaultConfig.baseDelay
  }

  /**
   * Cancel all active operations
   */
  cancelAllOperations(): void {
    this.cancelledOperations = new Set(this.activeOperations)
  }

  /**
   * Force clear all operations (for testing)
   */
  clearAllOperations(): void {
    this.activeOperations.clear()
    this.cancelledOperations.clear()
    this.operationControllers.clear()
  }

  /**
   * Get active operations count
   */
  getActiveOperationsCount(): number {
    return this.activeOperations.size
  }

  /**
   * Execute operation with timeout and retry (with operation ID tracking)
   */
  async executeWithTimeoutRetry<T>(
    operationIdOrOperation: string | ((signal?: AbortSignal) => Promise<T>),
    operationOrConfig?: ((signal?: AbortSignal) => Promise<T>) | Partial<RetryConfig> | { customConfig: Partial<RetryConfig>; operationId?: string },
    configOrWrapper?: Partial<RetryConfig> | { customConfig: Partial<RetryConfig>; operationId?: string }
  ): Promise<RetryResult<T>> {
    let operationId: string
    let operation: (signal?: AbortSignal) => Promise<T>
    let config: Partial<RetryConfig>

    // Handle different parameter patterns for test compatibility
    if (typeof operationIdOrOperation === 'string') {
      // Standard usage: executeWithTimeoutRetry(operationId, operation, config)
      operationId = operationIdOrOperation
      operation = operationOrConfig as (signal?: AbortSignal) => Promise<T>
      
      if (configOrWrapper && 'customConfig' in configOrWrapper) {
        config = configOrWrapper.customConfig
      } else {
        config = (configOrWrapper as Partial<RetryConfig>) || {}
      }
    } else {
      // Alternative usage: executeWithTimeoutRetry(operation, config)
      operation = operationIdOrOperation
      const configParam = operationOrConfig as { customConfig: Partial<RetryConfig>; operationId?: string } | Partial<RetryConfig>
      
      if (configParam && 'customConfig' in configParam) {
        config = configParam.customConfig
        operationId = configParam.operationId || `op-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      } else if (configParam && 'operationId' in configParam) {
        // Handle case where operationId is in the config directly
        operationId = configParam.operationId || `op-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        config = configParam
      } else {
        config = (configParam as Partial<RetryConfig>) || {}
        operationId = `op-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      }
    }

    const finalConfig = { ...this.defaultConfig, ...config }
    const startTime = Date.now()
    let lastError: Error | undefined
    
    // Track active operation
    this.activeOperations.add(operationId)
    
    try {
      for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
        try {
          // Check if operation was cancelled
          if (this.cancelledOperations.has(operationId)) {
            throw new Error('Operation was cancelled')
          }
          
          const data = await this.executeWithTimeout(operation, finalConfig.timeout, operationId)
          
          return {
            success: true,
            data,
            attempts: attempt + 1,
            totalTime: Date.now() - startTime
          }
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error))
          
          // Don't retry on last attempt
          if (attempt === finalConfig.maxRetries) {
            break
          }
          
          // Calculate delay for next attempt
          const delay = Math.min(
            finalConfig.baseDelay * Math.pow(finalConfig.backoffMultiplier, attempt),
            finalConfig.maxDelay
          )
          
          // Wait before retry
          await this.delay(delay)
        }
      }
      
      return {
        success: false,
        error: lastError,
        attempts: finalConfig.maxRetries + 1,
        totalTime: Date.now() - startTime
      }
    } finally {
      // Remove from active operations
      this.activeOperations.delete(operationId)
      this.cancelledOperations.delete(operationId)
      this.operationControllers.delete(operationId)
    }
  }

  /**
   * Get recommended configuration for operation type and network quality
   */
  getRecommendedConfig(
    operationType: string,
    networkQuality: 'excellent' | 'good' | 'poor' | 'offline' = 'good'
  ): RetryConfig {
    const baseConfigs: Record<string, Partial<RetryConfig>> = {
      'library-load': {
        maxRetries: 3,
        baseDelay: 2000,
        maxDelay: 30000,
        timeout: 30000
      },
      'model-load': {
        maxRetries: 2,
        baseDelay: 5000,
        maxDelay: 60000,
        timeout: 60000
      },
      'inference': {
        maxRetries: 2,
        baseDelay: 1000,
        maxDelay: 10000,
        timeout: 15000
      },
      'cache-operation': {
        maxRetries: 3,
        baseDelay: 500,
        maxDelay: 5000,
        timeout: 5000
      },
      'tts-load': {
        maxRetries: 2,
        baseDelay: 1500,
        maxDelay: 15000,
        timeout: 20000
      }
    }

    const networkMultipliers: Record<string, { timeout: number, delay: number }> = {
      'excellent': { timeout: 0.7, delay: 0.5 },
      'good': { timeout: 1.0, delay: 1.0 },
      'poor': { timeout: 2.0, delay: 2.0 },
      'offline': { timeout: 0.5, delay: 0.5 }
    }

    const baseConfig = baseConfigs[operationType] || baseConfigs['cache-operation']
    const multiplier = networkMultipliers[networkQuality] || networkMultipliers['good']

    return {
      ...this.defaultConfig,
      ...baseConfig,
      timeout: Math.round((baseConfig.timeout || this.defaultConfig.timeout) * multiplier.timeout),
      baseDelay: Math.round((baseConfig.baseDelay || this.defaultConfig.baseDelay) * multiplier.delay),
      maxDelay: Math.round((baseConfig.maxDelay || this.defaultConfig.maxDelay) * multiplier.delay)
    }
  }

  /**
   * Get active operation count (alias)
   */
  getActiveOperationCount(): number {
    return this.getActiveOperationsCount()
  }

  /**
   * Cancel specific operation
   */
  cancelOperation(operationId: string): boolean {
    if (this.activeOperations.has(operationId)) {
      this.cancelledOperations.add(operationId)
      
      // Abort the operation if it has a controller
      const controller = this.operationControllers.get(operationId)
      if (controller) {
        controller.abort()
      }
      
      return true
    }
    return false
  }

  /**
   * Check if should degrade operation based on failure rate
   */
  shouldDegrade(operationType: string, failureRate: number = 0.5): boolean {
    // Simple degradation logic based on operation type and failure rate
    const degradationThresholds: Record<string, number> = {
      'library-load': 0.7,
      'model-load': 0.6,
      'inference': 0.8,
      'cache-operation': 0.9,
      'tts-load': 0.7
    }

    const threshold = degradationThresholds[operationType] || 0.7
    return failureRate >= threshold
  }

  /**
   * Get degradation suggestion for operation type
   */
  getDegradationSuggestion(operationType: string): string {
    const suggestions: Record<string, string> = {
      'library-load': 'Use cached version or fallback library',
      'model-load': 'Load smaller model or use cached model',
      'inference': 'Reduce batch size or use simpler model',
      'cache-operation': 'Skip caching and use direct access',
      'tts-load': 'Use system TTS or disable audio features'
    }

    return suggestions[operationType] || 'Consider alternative approach or retry later'
  }
}

// Utility functions
export function calculateBackoffDelay(
  attempt: number,
  baseDelay: number,
  maxDelay: number,
  multiplier: number = 2
): number {
  return Math.min(baseDelay * Math.pow(multiplier, attempt), maxDelay)
}

export function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase()
  
  // Non-retryable errors (check first)
  if (message.includes('401') ||
      message.includes('403') ||
      message.includes('404') ||
      message.includes('invalid') ||
      message.includes('malformed') ||
      message.includes('permission denied') ||
      message.includes('unauthorized') ||
      message.includes('forbidden')) {
    return false
  }
  
  // Retryable errors
  if (message.includes('timeout') ||
      message.includes('network') ||
      message.includes('connection') ||
      message.includes('rate limit') ||
      message.includes('503') ||
      message.includes('502') ||
      message.includes('504') ||
      message.includes('fetch')) {
    return true
  }
  
  return false // Default to non-retryable for unknown errors
}

export function createTimeoutPromise<T>(
  promise: Promise<T>,
  timeout: number
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeout}ms`))
    }, timeout)
    
    promise
      .then(result => {
        clearTimeout(timeoutId)
        resolve(result)
      })
      .catch(error => {
        clearTimeout(timeoutId)
        reject(error)
      })
  })
}

export const aiTimeoutRetryManager = new AITimeoutRetryManager()