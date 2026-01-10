/**
 * AI错误处理器 - 统一错误处理和降级策略
 * 处理WebGPU不支持、网络错误、加载失败等场景
 */

import { ref } from 'vue'
import { logger } from '@/utils/logger'
import { syncChannel } from '@/utils/broadcast'

// 错误类型定义
export enum AIErrorType {
  WEBGPU_NOT_SUPPORTED = 'webgpu_not_supported',
  NETWORK_ERROR = 'network_error',
  MODEL_LOAD_FAILED = 'model_load_failed',
  INFERENCE_FAILED = 'inference_failed',
  STORAGE_QUOTA_EXCEEDED = 'storage_quota_exceeded',
  TIMEOUT_ERROR = 'timeout_error',
  UNKNOWN_ERROR = 'unknown_error'
}

// 错误严重程度
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

// 错误信息接口
export interface AIError {
  type: AIErrorType
  severity: ErrorSeverity
  message: string
  userMessage: string
  details?: any
  timestamp: number
  retryable: boolean
  fallbackAvailable: boolean
}

// 重试配置
interface RetryConfig {
  maxAttempts: number
  baseDelay: number
  maxDelay: number
  backoffFactor: number
}

// 降级策略配置
interface FallbackConfig {
  enableCPUFallback: boolean
  enableOfflineMode: boolean
  enableSimplifiedUI: boolean
  showDetailedErrors: boolean
}

/**
 * AI错误处理器类
 */
export class AIErrorHandler {
  private static instance: AIErrorHandler

  // 状态管理
  public readonly currentError = ref<AIError | null>(null)
  public readonly isInFallbackMode = ref(false)
  public readonly fallbackReason = ref<string>('')
  public readonly retryCount = ref(0)
  public readonly maxRetries = ref(3)

  // 配置
  private readonly defaultRetryConfig: RetryConfig = {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffFactor: 2
  }

  private readonly fallbackConfig: FallbackConfig = {
    enableCPUFallback: true,
    enableOfflineMode: true,
    enableSimplifiedUI: true,
    showDetailedErrors: false
  }

  // 错误统计
  private errorStats = new Map<AIErrorType, number>()
  private lastErrors: AIError[] = []
  private readonly MAX_ERROR_HISTORY = 50

  private constructor() {
    this.initializeEventListeners()
  }

  static getInstance(): AIErrorHandler {
    if (!AIErrorHandler.instance) {
      AIErrorHandler.instance = new AIErrorHandler()
    }
    return AIErrorHandler.instance
  }

  /**
   * 处理AI相关错误
   */
  async handleError(
    error: Error | AIError,
    context: string = 'unknown',
    retryConfig?: Partial<RetryConfig>
  ): Promise<AIError> {
    let aiError: AIError

    // 转换为标准AI错误格式
    if (this.isAIError(error)) {
      aiError = error
    } else {
      aiError = this.convertToAIError(error as Error, context)
    }

    // 记录错误
    this.recordError(aiError)
    this.currentError.value = aiError

    // 广播错误事件
    syncChannel.publish('ai-error', {
      error: aiError,
      context
    })

    logger.error(`[AI Error Handler] ${context}: ${aiError.message}`, {
      type: aiError.type,
      severity: aiError.severity,
      details: aiError.details
    })

    // 根据错误类型执行相应处理
    await this.executeErrorHandling(aiError, retryConfig)

    return aiError
  }

  /**
   * WebGPU不支持的降级处理
   */
  async handleWebGPUNotSupported(): Promise<void> {
    logger.warn('[AI Error Handler] WebGPU not supported, enabling fallback mode')

    const error: AIError = {
      type: AIErrorType.WEBGPU_NOT_SUPPORTED,
      severity: ErrorSeverity.HIGH,
      message: 'WebGPU is not supported in this browser',
      userMessage: '您的浏览器不支持WebGPU，AI功能将使用兼容模式运行',
      timestamp: Date.now(),
      retryable: false,
      fallbackAvailable: true
    }

    this.currentError.value = error
    this.isInFallbackMode.value = true
    this.fallbackReason.value = 'WebGPU不支持'

    // 启用CPU降级模式
    if (this.fallbackConfig.enableCPUFallback) {
      await this.enableCPUFallback()
    }

    // 简化UI
    if (this.fallbackConfig.enableSimplifiedUI) {
      this.enableSimplifiedUI()
    }

    // 广播降级事件
    syncChannel.publish('ai-fallback-enabled', {
      reason: 'webgpu_not_supported',
      fallbackMode: 'cpu'
    })
  }

  /**
   * 网络错误重试机制
   */
  async handleNetworkError(
    error: Error,
    operation: () => Promise<any>,
    retryConfig?: Partial<RetryConfig>
  ): Promise<any> {
    const config = { ...this.defaultRetryConfig, ...retryConfig }
    let lastError = error

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      this.retryCount.value = attempt

      if (attempt > 1) {
        // 计算退避延迟
        const delay = Math.min(
          config.baseDelay * Math.pow(config.backoffFactor, attempt - 1),
          config.maxDelay
        )

        logger.info(`[AI Error Handler] Retrying operation (attempt ${attempt}/${config.maxAttempts}) after ${delay}ms`)
        
        // 更新用户界面
        this.currentError.value = {
          type: AIErrorType.NETWORK_ERROR,
          severity: ErrorSeverity.MEDIUM,
          message: `Network error, retrying... (${attempt}/${config.maxAttempts})`,
          userMessage: `网络错误，正在重试... (${attempt}/${config.maxAttempts})`,
          timestamp: Date.now(),
          retryable: true,
          fallbackAvailable: false
        }

        await this.delay(delay)
      }

      try {
        const result = await operation()
        
        // 成功后清除错误状态
        this.clearError()
        this.retryCount.value = 0
        
        logger.info(`[AI Error Handler] Operation succeeded on attempt ${attempt}`)
        return result
      } catch (err) {
        lastError = err as Error
        logger.warn(`[AI Error Handler] Attempt ${attempt} failed:`, err)
      }
    }

    // 所有重试都失败了
    const finalError: AIError = {
      type: AIErrorType.NETWORK_ERROR,
      severity: ErrorSeverity.HIGH,
      message: `Network operation failed after ${config.maxAttempts} attempts: ${lastError.message}`,
      userMessage: `网络操作失败，已重试${config.maxAttempts}次。请检查网络连接后重试。`,
      details: { originalError: lastError, attempts: config.maxAttempts },
      timestamp: Date.now(),
      retryable: true,
      fallbackAvailable: this.fallbackConfig.enableOfflineMode
    }

    this.currentError.value = finalError
    this.retryCount.value = 0

    // 如果支持离线模式，尝试启用
    if (this.fallbackConfig.enableOfflineMode) {
      await this.enableOfflineMode()
    }

    throw finalError
  }

  /**
   * 模型加载失败处理
   */
  async handleModelLoadFailure(modelId: string, error: Error): Promise<void> {
    logger.error(`[AI Error Handler] Model load failed for ${modelId}:`, error)

    const aiError: AIError = {
      type: AIErrorType.MODEL_LOAD_FAILED,
      severity: ErrorSeverity.HIGH,
      message: `Failed to load model ${modelId}: ${error.message}`,
      userMessage: `模型 ${modelId} 加载失败。可能是网络问题或模型文件损坏。`,
      details: { modelId, originalError: error },
      timestamp: Date.now(),
      retryable: true,
      fallbackAvailable: true
    }

    this.currentError.value = aiError

    // 尝试清理损坏的缓存
    try {
      const { modelCacheManager } = await import('@/utils/modelCacheManager')
      await modelCacheManager.removeCachedModel(modelId)
      logger.info(`[AI Error Handler] Removed potentially corrupted cache for ${modelId}`)
    } catch (cacheError) {
      logger.warn('[AI Error Handler] Failed to clear model cache:', cacheError)
    }

    // 建议用户尝试其他模型
    this.suggestAlternativeModel(modelId)
  }

  /**
   * 存储配额超出处理
   */
  async handleStorageQuotaExceeded(): Promise<void> {
    logger.warn('[AI Error Handler] Storage quota exceeded')

    const error: AIError = {
      type: AIErrorType.STORAGE_QUOTA_EXCEEDED,
      severity: ErrorSeverity.MEDIUM,
      message: 'Storage quota exceeded',
      userMessage: '存储空间不足。系统将自动清理旧的缓存文件。',
      timestamp: Date.now(),
      retryable: true,
      fallbackAvailable: true
    }

    this.currentError.value = error

    // 自动清理缓存
    try {
      const { modelCacheManager } = await import('@/utils/modelCacheManager')
      const stats = await modelCacheManager.getCacheStats()
      
      if (stats.modelCount > 0) {
        // 清理最久未使用的模型
        logger.info('[AI Error Handler] Cleaning up old cached models...')
        // 这里可以实现更智能的清理策略
        
        // 暂时清理所有缓存（实际应用中应该更精细）
        await modelCacheManager.clearCache()
        
        this.currentError.value = {
          ...error,
          userMessage: '已清理缓存文件，请重试操作。'
        }
      }
    } catch (cleanupError) {
      logger.error('[AI Error Handler] Failed to cleanup cache:', cleanupError)
    }
  }

  /**
   * 推理失败处理
   */
  async handleInferenceFailure(error: Error, prompt: string): Promise<void> {
    logger.error('[AI Error Handler] Inference failed:', error)

    const aiError: AIError = {
      type: AIErrorType.INFERENCE_FAILED,
      severity: ErrorSeverity.MEDIUM,
      message: `Inference failed: ${error.message}`,
      userMessage: 'AI推理失败，可能是输入内容过长或模型出现问题。',
      details: { originalError: error, promptLength: prompt.length },
      timestamp: Date.now(),
      retryable: true,
      fallbackAvailable: false
    }

    this.currentError.value = aiError

    // 如果是输入过长，建议分段处理
    if (prompt.length > 4000) {
      aiError.userMessage = '输入内容过长，建议分段处理或缩短输入。'
      aiError.fallbackAvailable = true
    }
  }

  /**
   * 超时错误处理
   */
  async handleTimeoutError(operation: string, timeout: number): Promise<void> {
    logger.warn(`[AI Error Handler] Operation ${operation} timed out after ${timeout}ms`)

    const error: AIError = {
      type: AIErrorType.TIMEOUT_ERROR,
      severity: ErrorSeverity.MEDIUM,
      message: `Operation ${operation} timed out after ${timeout}ms`,
      userMessage: `操作超时（${timeout / 1000}秒）。可能是网络较慢或服务器繁忙。`,
      details: { operation, timeout },
      timestamp: Date.now(),
      retryable: true,
      fallbackAvailable: false
    }

    this.currentError.value = error
  }

  /**
   * 获取用户友好的错误消息
   */
  getUserFriendlyMessage(error: AIError): string {
    const baseMessage = error.userMessage

    // 根据错误类型添加建议
    switch (error.type) {
      case AIErrorType.WEBGPU_NOT_SUPPORTED:
        return `${baseMessage}\n\n建议：\n• 使用支持WebGPU的现代浏览器（Chrome 113+, Edge 113+）\n• 确保显卡驱动程序是最新版本`

      case AIErrorType.NETWORK_ERROR:
        return `${baseMessage}\n\n建议：\n• 检查网络连接\n• 尝试刷新页面\n• 如问题持续，请稍后再试`

      case AIErrorType.MODEL_LOAD_FAILED:
        return `${baseMessage}\n\n建议：\n• 检查网络连接\n• 尝试选择其他模型\n• 清理浏览器缓存后重试`

      case AIErrorType.STORAGE_QUOTA_EXCEEDED:
        return `${baseMessage}\n\n建议：\n• 清理浏览器存储空间\n• 关闭其他占用存储的网页\n• 使用轻量版模型`

      case AIErrorType.INFERENCE_FAILED:
        return `${baseMessage}\n\n建议：\n• 尝试缩短输入内容\n• 重新加载模型\n• 检查输入格式是否正确`

      case AIErrorType.TIMEOUT_ERROR:
        return `${baseMessage}\n\n建议：\n• 检查网络连接速度\n• 尝试使用更小的模型\n• 稍后再试`

      default:
        return `${baseMessage}\n\n如问题持续，请联系技术支持。`
    }
  }

  /**
   * 清除当前错误
   */
  clearError(): void {
    this.currentError.value = null
    this.retryCount.value = 0
  }

  /**
   * 获取错误统计
   */
  getErrorStats(): Record<string, number> {
    const stats: Record<string, number> = {}
    for (const [type, count] of this.errorStats.entries()) {
      stats[type] = count
    }
    return stats
  }

  /**
   * 获取最近的错误历史
   */
  getRecentErrors(limit: number = 10): AIError[] {
    return this.lastErrors.slice(-limit)
  }

  /**
   * 检查是否处于降级模式
   */
  isInFallback(): boolean {
    return this.isInFallbackMode.value
  }

  /**
   * 退出降级模式
   */
  exitFallbackMode(): void {
    this.isInFallbackMode.value = false
    this.fallbackReason.value = ''
    this.clearError()

    syncChannel.publish('ai-fallback-disabled', {
      timestamp: Date.now()
    })

    logger.info('[AI Error Handler] Exited fallback mode')
  }

  // 私有方法

  private initializeEventListeners(): void {
    // 监听全局错误事件
    if (typeof window !== 'undefined') {
      window.addEventListener('unhandledrejection', (event) => {
        if (this.isAIRelatedError(event.reason)) {
          this.handleError(event.reason, 'unhandled_rejection')
          event.preventDefault()
        }
      })
    }
  }

  private isAIError(error: any): error is AIError {
    return error && typeof error === 'object' && 'type' in error && 'severity' in error
  }

  private isAIRelatedError(error: any): boolean {
    if (!error) return false
    
    const errorMessage = error.message || error.toString()
    const aiKeywords = ['webgpu', 'webllm', 'piper', 'onnx', 'model', 'inference']
    
    return aiKeywords.some(keyword => 
      errorMessage.toLowerCase().includes(keyword)
    )
  }

  private convertToAIError(error: Error, context: string): AIError {
    const message = (error?.message || '').toLowerCase()
    
    // 根据错误消息推断错误类型
    let type = AIErrorType.UNKNOWN_ERROR
    let severity = ErrorSeverity.MEDIUM
    let userMessage = '发生未知错误，请稍后重试。'
    let retryable = true
    let fallbackAvailable = false

    if (message.includes('webgpu') || message.includes('gpu')) {
      type = AIErrorType.WEBGPU_NOT_SUPPORTED
      severity = ErrorSeverity.HIGH
      userMessage = '显卡加速不可用，将使用兼容模式。'
      retryable = false
      fallbackAvailable = true
    } else if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
      type = AIErrorType.NETWORK_ERROR
      severity = ErrorSeverity.MEDIUM
      userMessage = '网络连接出现问题，请检查网络后重试。'
      retryable = true
    } else if (message.includes('model') || message.includes('load')) {
      type = AIErrorType.MODEL_LOAD_FAILED
      severity = ErrorSeverity.HIGH
      userMessage = '模型加载失败，请重试或选择其他模型。'
      retryable = true
      fallbackAvailable = true
    } else if (message.includes('quota') || message.includes('storage')) {
      type = AIErrorType.STORAGE_QUOTA_EXCEEDED
      severity = ErrorSeverity.MEDIUM
      userMessage = '存储空间不足，请清理缓存后重试。'
      retryable = true
      fallbackAvailable = true
    }

    return {
      type,
      severity,
      message: error?.message || 'Unknown error',
      userMessage,
      details: { originalError: error, context },
      timestamp: Date.now(),
      retryable,
      fallbackAvailable
    }
  }

  private recordError(error: AIError): void {
    // 更新统计
    const currentCount = this.errorStats.get(error.type) || 0
    this.errorStats.set(error.type, currentCount + 1)

    // 添加到历史记录
    this.lastErrors.push(error)
    if (this.lastErrors.length > this.MAX_ERROR_HISTORY) {
      this.lastErrors.shift()
    }
  }

  private async executeErrorHandling(error: AIError, retryConfig?: Partial<RetryConfig>): Promise<void> {
    switch (error.type) {
      case AIErrorType.WEBGPU_NOT_SUPPORTED:
        await this.handleWebGPUNotSupported()
        break
      
      case AIErrorType.STORAGE_QUOTA_EXCEEDED:
        await this.handleStorageQuotaExceeded()
        break
      
      // 其他错误类型的处理逻辑已在各自的handle方法中实现
      default:
        // 通用错误处理
        break
    }
  }

  private async enableCPUFallback(): Promise<void> {
    logger.info('[AI Error Handler] Enabling CPU fallback mode')
    
    // 这里可以实现CPU降级逻辑
    // 例如：切换到CPU版本的AI库，或者禁用某些GPU特性
    
    syncChannel.publish('ai-cpu-fallback-enabled', {
      timestamp: Date.now()
    })
  }

  private enableSimplifiedUI(): void {
    logger.info('[AI Error Handler] Enabling simplified UI mode')
    
    // 广播UI简化事件
    syncChannel.publish('ui-simplify-enabled', {
      reason: 'performance_fallback',
      timestamp: Date.now()
    })
  }

  /**
   * 实现离线功能支持
   */
  async enableOfflineMode(): Promise<void> {
    logger.info('[AI Error Handler] Enabling offline mode')
    
    this.isInFallbackMode.value = true
    this.fallbackReason.value = '离线模式'
    
    // 检查已缓存的模型和资源
    try {
      const { modelCacheManager } = await import('@/utils/modelCacheManager')
      const cachedModels = await modelCacheManager.getCachedModelIds()
      
      if (cachedModels.length > 0) {
        logger.info(`[AI Error Handler] Found ${cachedModels.length} cached models for offline use`)
        
        // 更新错误状态，告知用户可以使用缓存的模型
        this.currentError.value = {
          type: AIErrorType.NETWORK_ERROR,
          severity: ErrorSeverity.MEDIUM,
          message: 'Network unavailable, using offline mode',
          userMessage: `网络不可用，已切换到离线模式。可以使用已缓存的${cachedModels.length}个模型。`,
          timestamp: Date.now(),
          retryable: true,
          fallbackAvailable: true
        }
      } else {
        // 没有缓存的模型
        this.currentError.value = {
          type: AIErrorType.NETWORK_ERROR,
          severity: ErrorSeverity.HIGH,
          message: 'Network unavailable, no cached models available',
          userMessage: '网络不可用且没有已缓存的模型。请在网络恢复后重试。',
          timestamp: Date.now(),
          retryable: true,
          fallbackAvailable: false
        }
      }
    } catch (error) {
      logger.error('[AI Error Handler] Failed to check cached models for offline mode:', error)
      
      this.currentError.value = {
        type: AIErrorType.NETWORK_ERROR,
        severity: ErrorSeverity.HIGH,
        message: 'Failed to enable offline mode',
        userMessage: '无法启用离线模式。请检查浏览器存储权限。',
        timestamp: Date.now(),
        retryable: true,
        fallbackAvailable: false
      }
    }
    
    syncChannel.publish('ai-offline-mode-enabled', {
      timestamp: Date.now()
    })
  }

  /**
   * 检查离线功能可用性
   */
  async checkOfflineAvailability(): Promise<{
    available: boolean
    cachedModels: string[]
    cachedTTSModels: string[]
    totalCacheSize: number
  }> {
    try {
      const { modelCacheManager } = await import('@/utils/modelCacheManager')
      const cachedModels = await modelCacheManager.getCachedModelIds()
      const stats = await modelCacheManager.getCacheStats()
      
      // 分离AI模型和TTS模型
      const aiModels = cachedModels.filter(id => !id.startsWith('tts-'))
      const ttsModels = cachedModels.filter(id => id.startsWith('tts-')).map(id => id.replace('tts-', ''))
      
      return {
        available: aiModels.length > 0,
        cachedModels: aiModels,
        cachedTTSModels: ttsModels,
        totalCacheSize: stats.totalSize
      }
    } catch (error) {
      logger.error('[AI Error Handler] Failed to check offline availability:', error)
      return {
        available: false,
        cachedModels: [],
        cachedTTSModels: [],
        totalCacheSize: 0
      }
    }
  }

  /**
   * 获取离线模式限制说明
   */
  getOfflineLimitations(): string[] {
    return [
      '只能使用已缓存的AI模型',
      '无法下载新的模型或更新现有模型',
      '某些在线功能（如模型推荐）不可用',
      '无法访问最新的模型版本',
      '性能监控数据无法上传',
      'TTS功能仅限于已缓存的语音模型'
    ]
  }

  /**
   * 检测网络状态
   */
  async detectNetworkStatus(): Promise<{
    online: boolean
    effectiveType?: string
    downlink?: number
    rtt?: number
  }> {
    try {
      // 检查navigator是否存在
      if (typeof navigator === 'undefined') {
        return { online: false }
      }

      // 使用Navigator API检测网络状态
      const online = navigator.onLine
      
      if (!online) {
        return { online: false }
      }
      
      // 获取网络连接信息
      const connection = (navigator as any).connection || 
                        (navigator as any).mozConnection || 
                        (navigator as any).webkitConnection
      
      if (connection) {
        return {
          online: true,
          effectiveType: connection.effectiveType,
          downlink: connection.downlink,
          rtt: connection.rtt
        }
      }
      
      // 简单的网络连通性测试
      if (typeof fetch !== 'undefined') {
        try {
          const response = await fetch('/favicon.ico', { 
            method: 'HEAD',
            cache: 'no-cache',
            signal: AbortSignal.timeout(3000)
          })
          return { online: response.ok }
        } catch {
          return { online: false }
        }
      }
      
      // 如果fetch不可用，回退到navigator.onLine
      return { online: online }
    } catch (error) {
      logger.warn('[AI Error Handler] Failed to detect network status:', error)
      return { 
        online: typeof navigator !== 'undefined' ? navigator.onLine : false 
      }
    }
  }

  private suggestAlternativeModel(failedModelId: string): void {
    // 根据失败的模型推荐替代模型
    const alternatives = this.getAlternativeModels(failedModelId)
    
    if (alternatives.length > 0) {
      syncChannel.publish('ai-model-suggestion', {
        failedModel: failedModelId,
        alternatives,
        timestamp: Date.now()
      })
    }
  }

  private getAlternativeModels(modelId: string): string[] {
    // 简单的替代模型推荐逻辑
    const alternatives: string[] = []
    
    if (modelId.includes('large') || modelId.includes('8b')) {
      alternatives.push('Qwen2.5-3B-Instruct-q4f16_1-MLC')
      alternatives.push('Qwen2.5-1.5B-Instruct-q4f16_1-MLC')
    } else if (modelId.includes('medium') || modelId.includes('3b')) {
      alternatives.push('Qwen2.5-1.5B-Instruct-q4f16_1-MLC')
      alternatives.push('Qwen2.5-0.5B-Instruct-q4f16_1-MLC')
    }
    
    return alternatives
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// 导出单例实例
export const aiErrorHandler = AIErrorHandler.getInstance()

// 导出便捷方法
export const handleAIError = (error: Error | AIError, context?: string) => 
  aiErrorHandler.handleError(error, context)

export const handleNetworkError = (error: Error, operation: () => Promise<any>, retryConfig?: Partial<RetryConfig>) =>
  aiErrorHandler.handleNetworkError(error, operation, retryConfig)

export const clearAIError = () => aiErrorHandler.clearError()

export const isInAIFallbackMode = () => aiErrorHandler.isInFallback()