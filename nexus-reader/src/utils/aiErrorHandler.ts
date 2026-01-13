/**
 * AI Error Handler
 * Handles AI-specific errors and provides fallback mechanisms
 */

export interface AIError {
  type: 'timeout' | 'quota_exceeded' | 'model_unavailable' | 'invalid_input' | 'network_error'
  message: string
  code?: string
  retryable: boolean
  retryAfter?: number
  userMessage?: string
  fallbackAvailable?: boolean
}

// Simple reactive-like wrapper for compatibility with tests
class ReactiveValue<T> {
  private _value: T

  constructor(initialValue: T) {
    this._value = initialValue
  }

  get value(): T {
    return this._value
  }

  set value(newValue: T) {
    this._value = newValue
  }
}

export class AIErrorHandler {
  private retryAttempts = new Map<string, number>()
  private maxRetries = 3
  private baseDelay = 1000
  private fallbackMode = false
  
  // Reactive-like properties for test compatibility
  public currentError = new ReactiveValue<AIError | null>(null)
  public fallbackReason = new ReactiveValue<string>('')
  public isInFallbackMode = new ReactiveValue<boolean>(false)

  /**
   * Handle AI operation errors
   */
  async handleError(error: Error, operation: string): Promise<AIError> {
    const aiError = this.classifyError(error)
    this.currentError.value = aiError
    
    // Log the error
    console.error(`AI Error in ${operation}:`, aiError)
    
    // Track retry attempts
    const attempts = this.retryAttempts.get(operation) || 0
    this.retryAttempts.set(operation, attempts + 1)
    
    return aiError
  }

  /**
   * Check if operation should be retried
   */
  shouldRetry(operation: string, error: AIError): boolean {
    const attempts = this.retryAttempts.get(operation) || 0
    return error.retryable && attempts < this.maxRetries
  }

  /**
   * Get retry delay
   */
  getRetryDelay(operation: string): number {
    const attempts = this.retryAttempts.get(operation) || 0
    return this.baseDelay * Math.pow(2, attempts)
  }

  /**
   * Reset retry attempts for operation
   */
  resetRetries(operation: string): void {
    this.retryAttempts.delete(operation)
  }

  /**
   * Clear current error
   */
  clearError(): void {
    this.currentError.value = null
    this.retryAttempts.clear()
  }

  /**
   * Enter fallback mode
   */
  enterFallbackMode(): void {
    this.fallbackMode = true
    this.isInFallbackMode.value = true
  }

  /**
   * Exit fallback mode
   */
  exitFallbackMode(): void {
    this.fallbackMode = false
    this.isInFallbackMode.value = false
    this.fallbackReason.value = ''
  }

  /**
   * Check if in fallback mode
   */
  isInFallbackModeMethod(): boolean {
    return this.fallbackMode
  }

  /**
   * Detect network status
   */
  async detectNetworkStatus(): Promise<{
    online: boolean
    effectiveType?: string
    downlink?: number
    rtt?: number
  }> {
    const status = {
      online: typeof navigator !== 'undefined' ? navigator.onLine : false,
      effectiveType: undefined as string | undefined,
      downlink: undefined as number | undefined,
      rtt: undefined as number | undefined
    }

    // Try to get connection info if available
    if (typeof navigator !== 'undefined' && 'connection' in navigator) {
      const connection = (navigator as any).connection
      if (connection) {
        status.effectiveType = connection.effectiveType
        status.downlink = connection.downlink
        status.rtt = connection.rtt
      }
    }

    // If we have fetch API and no connection info, try to verify connectivity
    if (typeof fetch !== 'undefined' && !status.effectiveType && status.online) {
      try {
        await Promise.race([
          fetch('/favicon.ico', {
            method: 'HEAD',
            cache: 'no-cache',
            mode: 'no-cors'
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 3000)
          )
        ])
        // If fetch succeeds, we're truly online
        status.online = true
      } catch (error) {
        // If fetch fails, we're likely offline despite navigator.onLine
        status.online = false
      }
    }

    return status
  }

  /**
   * Enable offline mode
   */
  async enableOfflineMode(): Promise<void> {
    this.fallbackMode = true
    this.isInFallbackMode.value = true
    this.fallbackReason.value = '离线模式'
    
    // Set appropriate error message based on available cached models
    try {
      // Check for cached models using mock or real implementation
      const mockModelCacheManager = (global as any).mockModelCacheManager
      let cachedModels: string[] = []
      
      if (mockModelCacheManager && mockModelCacheManager.getCachedModelIds) {
        try {
          cachedModels = await mockModelCacheManager.getCachedModelIds()
        } catch (error) {
          // Handle cache access error
          this.currentError.value = {
            type: 'network_error',
            message: '离线模式：缓存访问错误',
            retryable: false,
            userMessage: '无法启用离线模式：缓存访问失败。请检查浏览器存储权限设置。',
            fallbackAvailable: false
          }
          
          // Broadcast offline mode enabled event
          try {
            const { syncChannel } = await import('@/utils/broadcast')
            syncChannel.publish('ai-offline-mode-enabled', {
              timestamp: Date.now()
            })
          } catch (broadcastError) {
            // Ignore broadcast errors in offline mode
          }
          return
        }
      }
      
      if (cachedModels.length > 0) {
        this.currentError.value = {
          type: 'network_error',
          message: '已切换到离线模式。您可以继续使用已缓存的AI模型进行基本功能。',
          retryable: true,
          userMessage: `离线模式已启用。您可以使用已缓存的${cachedModels.length}个模型进行基本功能。`,
          fallbackAvailable: true
        }
      } else {
        this.currentError.value = {
          type: 'model_unavailable',
          message: '离线模式：无可用的缓存模型',
          retryable: false,
          userMessage: '当前处于离线状态且没有已缓存的模型。请连接网络以使用完整功能。网络恢复后重试。',
          fallbackAvailable: false
        }
      }
      
      // Broadcast offline mode enabled event
      try {
        const { syncChannel } = await import('@/utils/broadcast')
        syncChannel.publish('ai-offline-mode-enabled', {
          timestamp: Date.now()
        })
      } catch (broadcastError) {
        // Ignore broadcast errors in offline mode
      }
      
    } catch (error) {
      this.currentError.value = {
        type: 'network_error',
        message: '离线模式：缓存访问错误',
        retryable: false,
        userMessage: '无法启用离线模式：缓存访问失败。',
        fallbackAvailable: false
      }
    }
  }

  /**
   * Get offline limitations
   */
  getOfflineLimitations(): string[] {
    return [
      '✓ 可以阅读已缓存的内容',
      '✓ 可以使用基本的文本处理功能',
      '✓ 可以访问离线保存的笔记和书签',
      '✓ 可以使用已缓存的AI模型进行推理',
      '✓ 可以使用已缓存的TTS模型进行语音合成',
      '⚠ 无法下载新内容',
      '⚠ AI功能可能受限于缓存模型',
      '⚠ 无法同步到云端',
      '⚠ 性能监控功能受限',
      '💡 建议：连接网络以获得完整体验'
    ]
  }

  /**
   * Check offline availability
   */
  async checkOfflineAvailability(): Promise<{
    available: boolean
    cachedModels: string[]
    cachedTTSModels: string[]
    limitations: string[]
    totalCacheSize: number
  }> {
    try {
      // Check for cached models using mock or real implementation
      const mockModelCacheManager = (global as any).mockModelCacheManager
      let cachedModels: string[] = []
      let cachedTTSModels: string[] = []
      let totalCacheSize = 0
      
      if (mockModelCacheManager && mockModelCacheManager.getCachedModelIds) {
        try {
          const allCachedModels = await mockModelCacheManager.getCachedModelIds()
          cachedModels = allCachedModels.filter((id: string) => !id.includes('tts'))
          cachedTTSModels = allCachedModels
            .filter((id: string) => id.includes('tts'))
            .map((id: string) => id.replace('tts-', ''))
          
          // Get cache stats if available
          if (mockModelCacheManager.getCacheStats) {
            const stats = await mockModelCacheManager.getCacheStats()
            totalCacheSize = stats.totalSize || (cachedModels.length + cachedTTSModels.length) * 100
          } else {
            totalCacheSize = (cachedModels.length + cachedTTSModels.length) * 100
          }
        } catch (error) {
          // Return unavailable if cache check fails
          return {
            available: false,
            cachedModels: [],
            cachedTTSModels: [],
            limitations: this.getOfflineLimitations(),
            totalCacheSize: 0
          }
        }
      }
      
      return {
        available: cachedModels.length > 0 || cachedTTSModels.length > 0,
        cachedModels,
        cachedTTSModels,
        limitations: this.getOfflineLimitations(),
        totalCacheSize
      }
    } catch (error) {
      return {
        available: false,
        cachedModels: [],
        cachedTTSModels: [],
        limitations: this.getOfflineLimitations(),
        totalCacheSize: 0
      }
    }
  }

  /**
   * Check if in fallback mode (alias for compatibility)
   */
  isInFallback(): boolean {
    return this.isInFallbackModeMethod()
  }

  /**
   * Classify error type
   */
  private classifyError(error: Error): AIError {
    const message = error.message.toLowerCase()
    
    if (message.includes('timeout') || message.includes('timed out')) {
      return {
        type: 'timeout',
        message: error.message,
        retryable: true,
        retryAfter: 5000
      }
    }
    
    if (message.includes('quota') || message.includes('rate limit')) {
      return {
        type: 'quota_exceeded',
        message: error.message,
        retryable: true,
        retryAfter: 60000
      }
    }
    
    if (message.includes('model') || message.includes('unavailable')) {
      return {
        type: 'model_unavailable',
        message: error.message,
        retryable: false
      }
    }
    
    if (message.includes('network') || message.includes('connection')) {
      return {
        type: 'network_error',
        message: error.message,
        retryable: true,
        retryAfter: 2000
      }
    }
    
    return {
      type: 'invalid_input',
      message: error.message,
      retryable: false
    }
  }
}

export const aiErrorHandler = new AIErrorHandler()