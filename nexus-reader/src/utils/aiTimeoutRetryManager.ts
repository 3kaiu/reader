/**
 * AI Timeout and Retry Manager - AI超时和重试管理器
 * 专门为AI库和模型加载提供超时和重试机制
 */

import { performanceMonitor } from './performanceMonitor'
import { aiErrorHandler } from './aiErrorHandler'
import { networkDetector, type NetworkQuality } from './networkOptimizer'

// AI操作类型
export type AIOperationType = 'library-load' | 'model-load' | 'inference' | 'tts-load' | 'cache-operation'

// 超时配置接口
export interface TimeoutConfig {
  timeout: number           // 超时时间（毫秒）
  maxRetries: number       // 最大重试次数
  baseDelay: number        // 基础延迟时间（毫秒）
  maxDelay: number         // 最大延迟时间（毫秒）
  backoffMultiplier: number // 退避倍数
  jitterFactor: number     // 抖动因子
}

// AI操作结果接口
export interface AIOperationResult<T> {
  success: boolean
  data?: T
  error?: Error
  attempts: number
  totalTime: number
  networkQuality: NetworkQuality
}

// 默认超时配置 - 根据网络质量和操作类型调整
const DEFAULT_TIMEOUT_CONFIGS: Record<NetworkQuality, Record<AIOperationType, TimeoutConfig>> = {
  excellent: {
    'library-load': {
      timeout: 15000,      // 15秒
      maxRetries: 2,
      baseDelay: 500,
      maxDelay: 2000,
      backoffMultiplier: 2,
      jitterFactor: 0.1
    },
    'model-load': {
      timeout: 60000,      // 1分钟
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 5000,
      backoffMultiplier: 2,
      jitterFactor: 0.2
    },
    'inference': {
      timeout: 30000,      // 30秒
      maxRetries: 2,
      baseDelay: 200,
      maxDelay: 1000,
      backoffMultiplier: 1.5,
      jitterFactor: 0.1
    },
    'tts-load': {
      timeout: 10000,      // 10秒
      maxRetries: 2,
      baseDelay: 300,
      maxDelay: 1500,
      backoffMultiplier: 2,
      jitterFactor: 0.1
    },
    'cache-operation': {
      timeout: 5000,       // 5秒
      maxRetries: 3,
      baseDelay: 100,
      maxDelay: 500,
      backoffMultiplier: 1.5,
      jitterFactor: 0.05
    }
  },
  good: {
    'library-load': {
      timeout: 25000,      // 25秒
      maxRetries: 3,
      baseDelay: 800,
      maxDelay: 3000,
      backoffMultiplier: 2,
      jitterFactor: 0.15
    },
    'model-load': {
      timeout: 90000,      // 1.5分钟
      maxRetries: 3,
      baseDelay: 1500,
      maxDelay: 8000,
      backoffMultiplier: 2,
      jitterFactor: 0.25
    },
    'inference': {
      timeout: 45000,      // 45秒
      maxRetries: 3,
      baseDelay: 500,
      maxDelay: 2000,
      backoffMultiplier: 1.8,
      jitterFactor: 0.15
    },
    'tts-load': {
      timeout: 15000,      // 15秒
      maxRetries: 3,
      baseDelay: 500,
      maxDelay: 2500,
      backoffMultiplier: 2,
      jitterFactor: 0.15
    },
    'cache-operation': {
      timeout: 8000,       // 8秒
      maxRetries: 3,
      baseDelay: 200,
      maxDelay: 1000,
      backoffMultiplier: 1.8,
      jitterFactor: 0.1
    }
  },
  fair: {
    'library-load': {
      timeout: 45000,      // 45秒
      maxRetries: 4,
      baseDelay: 1200,
      maxDelay: 5000,
      backoffMultiplier: 2.2,
      jitterFactor: 0.2
    },
    'model-load': {
      timeout: 180000,     // 3分钟
      maxRetries: 4,
      baseDelay: 2000,
      maxDelay: 12000,
      backoffMultiplier: 2.5,
      jitterFactor: 0.3
    },
    'inference': {
      timeout: 60000,      // 1分钟
      maxRetries: 3,
      baseDelay: 800,
      maxDelay: 4000,
      backoffMultiplier: 2,
      jitterFactor: 0.2
    },
    'tts-load': {
      timeout: 25000,      // 25秒
      maxRetries: 4,
      baseDelay: 800,
      maxDelay: 4000,
      backoffMultiplier: 2.2,
      jitterFactor: 0.2
    },
    'cache-operation': {
      timeout: 12000,      // 12秒
      maxRetries: 4,
      baseDelay: 300,
      maxDelay: 1500,
      backoffMultiplier: 2,
      jitterFactor: 0.15
    }
  },
  poor: {
    'library-load': {
      timeout: 90000,      // 1.5分钟
      maxRetries: 5,
      baseDelay: 2000,
      maxDelay: 10000,
      backoffMultiplier: 2.5,
      jitterFactor: 0.3
    },
    'model-load': {
      timeout: 300000,     // 5分钟
      maxRetries: 5,
      baseDelay: 3000,
      maxDelay: 20000,
      backoffMultiplier: 3,
      jitterFactor: 0.4
    },
    'inference': {
      timeout: 120000,     // 2分钟
      maxRetries: 4,
      baseDelay: 1500,
      maxDelay: 8000,
      backoffMultiplier: 2.5,
      jitterFactor: 0.3
    },
    'tts-load': {
      timeout: 45000,      // 45秒
      maxRetries: 5,
      baseDelay: 1500,
      maxDelay: 8000,
      backoffMultiplier: 2.5,
      jitterFactor: 0.3
    },
    'cache-operation': {
      timeout: 20000,      // 20秒
      maxRetries: 5,
      baseDelay: 500,
      maxDelay: 3000,
      backoffMultiplier: 2.2,
      jitterFactor: 0.2
    }
  },
  offline: {
    'library-load': {
      timeout: 5000,       // 5秒（仅检查缓存）
      maxRetries: 0,
      baseDelay: 0,
      maxDelay: 0,
      backoffMultiplier: 1,
      jitterFactor: 0
    },
    'model-load': {
      timeout: 10000,      // 10秒（仅检查缓存）
      maxRetries: 0,
      baseDelay: 0,
      maxDelay: 0,
      backoffMultiplier: 1,
      jitterFactor: 0
    },
    'inference': {
      timeout: 60000,      // 1分钟（使用已加载的模型）
      maxRetries: 1,
      baseDelay: 1000,
      maxDelay: 1000,
      backoffMultiplier: 1,
      jitterFactor: 0
    },
    'tts-load': {
      timeout: 5000,       // 5秒（仅检查缓存）
      maxRetries: 0,
      baseDelay: 0,
      maxDelay: 0,
      backoffMultiplier: 1,
      jitterFactor: 0
    },
    'cache-operation': {
      timeout: 3000,       // 3秒
      maxRetries: 1,
      baseDelay: 100,
      maxDelay: 100,
      backoffMultiplier: 1,
      jitterFactor: 0
    }
  }
}

/**
 * AI超时和重试管理器
 */
export class AITimeoutRetryManager {
  private activeOperations = new Map<string, AbortController>()
  private operationStats = new Map<string, { attempts: number; totalTime: number }>()

  /**
   * 执行带超时和重试的AI操作
   */
  async executeWithTimeoutRetry<T>(
    operationType: AIOperationType,
    operationFn: (signal: AbortSignal) => Promise<T>,
    options?: {
      operationId?: string
      customConfig?: Partial<TimeoutConfig>
      onProgress?: (attempt: number, maxAttempts: number) => void
      onRetry?: (attempt: number, error: Error, delay: number) => void
    }
  ): Promise<AIOperationResult<T>> {
    const operationId = options?.operationId || `${operationType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const networkQuality = networkDetector.getNetworkQuality()
    const config = {
      ...DEFAULT_TIMEOUT_CONFIGS[networkQuality][operationType],
      ...options?.customConfig
    }

    const startTime = Date.now()
    let lastError: Error | null = null
    let attempts = 0

    // 记录操作开始
    this.operationStats.set(operationId, { attempts: 0, totalTime: 0 })

    try {
      for (attempts = 0; attempts <= config.maxRetries; attempts++) {
        // 创建AbortController用于超时控制
        const abortController = new AbortController()
        this.activeOperations.set(operationId, abortController)

        // 更新统计
        const stats = this.operationStats.get(operationId)!
        stats.attempts = attempts + 1

        // 报告进度
        options?.onProgress?.(attempts + 1, config.maxRetries + 1)

        try {
          // 设置超时
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
              abortController.abort()
              reject(new Error(`AI operation ${operationType} timed out after ${config.timeout}ms`))
            }, config.timeout)
          })

          // 执行操作，使用Promise.race来实现超时
          const result = await Promise.race([
            operationFn(abortController.signal),
            timeoutPromise
          ])

          // 清理
          this.activeOperations.delete(operationId)

          // 成功完成
          const totalTime = Date.now() - startTime
          stats.totalTime = totalTime

          // 报告成功指标
          performanceMonitor.reportMetric(`ai_${operationType}_success`, totalTime, {
            attempts: attempts + 1,
            networkQuality,
            operationId
          })

          console.log(`✅ AI operation ${operationType} completed successfully in ${totalTime}ms (${attempts + 1} attempts)`)

          return {
            success: true,
            data: result,
            attempts: attempts + 1,
            totalTime,
            networkQuality
          }

        } catch (error) {
          lastError = error as Error
          this.activeOperations.delete(operationId)

          // 检查是否是取消操作
          if (abortController.signal.aborted) {
            const timeoutError = new Error(`AI operation ${operationType} timed out after ${config.timeout}ms`)
            lastError = timeoutError

            // 报告超时
            performanceMonitor.reportMetric(`ai_${operationType}_timeout`, config.timeout, {
              attempts: attempts + 1,
              networkQuality,
              operationId
            })

            console.warn(`⏰ AI operation ${operationType} timed out (attempt ${attempts + 1})`)
          }

          // 如果是最后一次尝试，不再重试
          if (attempts === config.maxRetries) {
            break
          }

          // 计算延迟时间（指数退避 + 抖动）
          const baseDelay = Math.min(
            config.baseDelay * Math.pow(config.backoffMultiplier, attempts),
            config.maxDelay
          )
          const jitter = baseDelay * config.jitterFactor * Math.random()
          const delay = Math.round(baseDelay + jitter)

          console.log(`🔄 AI operation ${operationType} failed (attempt ${attempts + 1}), retrying in ${delay}ms...`)
          console.log(`   Error: ${lastError.message}`)

          // 报告重试
          options?.onRetry?.(attempts + 1, lastError, delay)

          // 等待延迟
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }

      // 所有重试都失败了
      const totalTime = Date.now() - startTime
      const stats = this.operationStats.get(operationId)!
      stats.totalTime = totalTime

      // 报告失败指标
      performanceMonitor.reportMetric(`ai_${operationType}_failed`, totalTime, {
        attempts,
        networkQuality,
        operationId,
        error: lastError?.message
      })

      // 使用错误处理器处理错误
      const handledError = await aiErrorHandler.handleError(lastError!, {
        operation: operationType,
        attempts,
        networkQuality,
        operationId
      })

      console.error(`❌ AI operation ${operationType} failed after ${attempts} attempts in ${totalTime}ms`)

      return {
        success: false,
        error: handledError,
        attempts,
        totalTime,
        networkQuality
      }

    } finally {
      // 清理
      this.activeOperations.delete(operationId)
      this.operationStats.delete(operationId)
    }
  }

  /**
   * 取消正在进行的操作
   */
  cancelOperation(operationId: string): boolean {
    const controller = this.activeOperations.get(operationId)
    if (controller) {
      controller.abort()
      this.activeOperations.delete(operationId)
      console.log(`🚫 AI operation ${operationId} cancelled`)
      return true
    }
    return false
  }

  /**
   * 取消所有正在进行的操作
   */
  cancelAllOperations(): void {
    const operationIds = Array.from(this.activeOperations.keys())
    operationIds.forEach(id => this.cancelOperation(id))
    console.log(`🚫 Cancelled ${operationIds.length} AI operations`)
  }

  /**
   * 获取正在进行的操作数量
   */
  getActiveOperationCount(): number {
    return this.activeOperations.size
  }

  /**
   * 获取操作统计信息
   */
  getOperationStats(): Array<{ operationId: string; attempts: number; totalTime: number }> {
    return Array.from(this.operationStats.entries()).map(([operationId, stats]) => ({
      operationId,
      ...stats
    }))
  }

  /**
   * 获取推荐的超时配置
   */
  getRecommendedConfig(operationType: AIOperationType, networkQuality?: NetworkQuality): TimeoutConfig {
    const quality = networkQuality || networkDetector.getNetworkQuality()
    return { ...DEFAULT_TIMEOUT_CONFIGS[quality][operationType] }
  }

  /**
   * 检查操作是否应该降级
   */
  shouldDegrade(operationType: AIOperationType): boolean {
    const networkQuality = networkDetector.getNetworkQuality()
    
    // 离线时只允许缓存操作和推理
    if (networkQuality === 'offline') {
      return !['cache-operation', 'inference'].includes(operationType)
    }

    // 网络质量差时建议降级某些操作
    if (networkQuality === 'poor') {
      return ['library-load', 'model-load'].includes(operationType)
    }

    return false
  }

  /**
   * 获取降级建议
   */
  getDegradationSuggestion(operationType: AIOperationType): string {
    const networkQuality = networkDetector.getNetworkQuality()
    
    switch (operationType) {
      case 'library-load':
        if (networkQuality === 'offline') {
          return '网络离线，请检查网络连接后重试'
        }
        if (networkQuality === 'poor') {
          return '网络较慢，建议稍后重试或使用缓存版本'
        }
        break
        
      case 'model-load':
        if (networkQuality === 'offline') {
          return '网络离线，只能使用已缓存的模型'
        }
        if (networkQuality === 'poor') {
          return '网络较慢，建议使用较小的模型或稍后重试'
        }
        break
        
      case 'inference':
        if (networkQuality === 'offline') {
          return '网络离线，使用本地推理'
        }
        break
        
      case 'tts-load':
        if (networkQuality === 'offline') {
          return '网络离线，请检查网络连接后重试'
        }
        if (networkQuality === 'poor') {
          return '网络较慢，建议使用系统TTS或稍后重试'
        }
        break
        
      case 'cache-operation':
        return '缓存操作失败，可能影响性能但不影响基本功能'
    }
    
    return '操作可能受网络影响，建议检查网络连接'
  }
}

// 创建全局实例
export const aiTimeoutRetryManager = new AITimeoutRetryManager()

// 工具函数
export function createTimeoutPromise<T>(promise: Promise<T>, timeout: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeout}ms`))
    }, timeout)

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timeoutId))
  })
}

export function calculateBackoffDelay(
  attempt: number,
  baseDelay: number,
  maxDelay: number,
  backoffMultiplier: number,
  jitterFactor: number
): number {
  const exponentialDelay = Math.min(
    baseDelay * Math.pow(backoffMultiplier, attempt),
    maxDelay
  )
  const jitter = exponentialDelay * jitterFactor * Math.random()
  return Math.round(exponentialDelay + jitter)
}

export function isRetryableError(error: Error): boolean {
  const retryableMessages = [
    'timeout',
    'network',
    'connection',
    'fetch',
    'load',
    'abort'
  ]
  
  const message = error.message.toLowerCase()
  return retryableMessages.some(keyword => message.includes(keyword))
}

// 类型导出
export type { TimeoutConfig, AIOperationResult }