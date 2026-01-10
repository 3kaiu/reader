/**
 * 超时重试机制属性测试
 * 验证AI操作的超时和重试机制的正确性和可靠性
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock window object
const mockWindow = {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  setInterval: vi.fn((fn, delay) => {
    return setTimeout(fn, delay) // 简化实现
  }),
  clearInterval: vi.fn((id) => clearTimeout(id))
}

Object.defineProperty(globalThis, 'window', {
  value: mockWindow,
  writable: true
})

// Mock navigator
const mockNavigator = {
  onLine: true,
  connection: {
    effectiveType: '4g',
    downlink: 10,
    rtt: 50
  }
}

Object.defineProperty(globalThis, 'navigator', {
  value: mockNavigator,
  writable: true
})

import { 
  aiTimeoutRetryManager, 
  type AIOperationType, 
  type TimeoutConfig,
  calculateBackoffDelay,
  isRetryableError,
  createTimeoutPromise
} from '@/utils/aiTimeoutRetryManager'

// Mock dependencies
vi.mock('@/utils/performanceMonitor', () => ({
  performanceMonitor: {
    reportMetric: vi.fn()
  }
}))

vi.mock('@/utils/aiErrorHandler', () => ({
  aiErrorHandler: {
    handleError: vi.fn((error) => Promise.resolve(error))
  }
}))

vi.mock('@/utils/networkOptimizer', () => ({
  networkDetector: {
    getNetworkQuality: vi.fn(() => 'good')
  }
}))

// Mock console methods
const originalConsoleLog = console.log
const originalConsoleWarn = console.warn
const originalConsoleError = console.error

describe('超时重试机制属性测试 (Property 29)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Mock console to avoid test output noise
    console.log = vi.fn()
    console.warn = vi.fn()
    console.error = vi.fn()
    
    // 清理所有活动操作
    aiTimeoutRetryManager.cancelAllOperations()
  })

  afterEach(() => {
    // 恢复console
    console.log = originalConsoleLog
    console.warn = originalConsoleWarn
    console.error = originalConsoleError
    
    // 清理所有活动操作
    aiTimeoutRetryManager.cancelAllOperations()
  })

  describe('属性1: 超时机制', () => {
    it('应该在指定时间内超时', async () => {
      const timeout = 1000 // 1秒
      const operationType: AIOperationType = 'library-load'
      
      // 创建一个永远不会完成的操作
      const neverCompleteOperation = (signal: AbortSignal) => 
        new Promise<string>((resolve) => {
          // 这个Promise永远不会resolve
        })

      const startTime = Date.now()
      const result = await aiTimeoutRetryManager.executeWithTimeoutRetry(
        operationType,
        neverCompleteOperation,
        {
          customConfig: { 
            timeout,
            maxRetries: 0 // 不重试，只测试超时
          }
        }
      )

      const endTime = Date.now()
      const actualTime = endTime - startTime

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(actualTime).toBeGreaterThanOrEqual(timeout - 100) // 允许100ms误差
      expect(actualTime).toBeLessThan(timeout + 500) // 不应该超过太多
    })

    it('应该正确处理AbortSignal', async () => {
      const operationType: AIOperationType = 'model-load'
      let signalReceived: AbortSignal | null = null
      
      const operationWithSignal = (signal: AbortSignal) => {
        signalReceived = signal
        return new Promise<string>((resolve) => {
          // 检查信号状态
          if (signal.aborted) {
            throw new Error('Operation was aborted')
          }
          
          // 监听abort事件
          signal.addEventListener('abort', () => {
            throw new Error('Operation was aborted')
          })
          
          // 模拟长时间操作
          setTimeout(() => resolve('success'), 2000)
        })
      }

      const result = await aiTimeoutRetryManager.executeWithTimeoutRetry(
        operationType,
        operationWithSignal,
        {
          customConfig: { 
            timeout: 500,
            maxRetries: 0
          }
        }
      )

      expect(signalReceived).toBeDefined()
      expect(signalReceived!.aborted).toBe(true)
      expect(result.success).toBe(false)
    })

    it('应该为不同操作类型使用不同的超时时间', async () => {
      const operationTypes: AIOperationType[] = ['library-load', 'model-load', 'inference', 'tts-load', 'cache-operation']
      
      for (const operationType of operationTypes) {
        const config = aiTimeoutRetryManager.getRecommendedConfig(operationType)
        expect(config.timeout).toBeGreaterThan(0)
        expect(config.maxRetries).toBeGreaterThanOrEqual(0)
        
        // 不同操作类型应该有不同的配置
        if (operationType === 'model-load') {
          expect(config.timeout).toBeGreaterThan(50000) // 模型加载应该有更长的超时时间
        }
        if (operationType === 'cache-operation') {
          expect(config.timeout).toBeLessThan(15000) // 缓存操作应该有较短的超时时间
        }
      }
    })

    it('应该根据网络质量调整超时时间', async () => {
      const operationType: AIOperationType = 'library-load'
      
      // 测试不同网络质量
      const networkQualities = ['excellent', 'good', 'fair', 'poor'] as const // 移除offline避免复杂性
      const configs: TimeoutConfig[] = []
      
      for (const quality of networkQualities) {
        // 直接调用方法而不是mock
        const config = aiTimeoutRetryManager.getRecommendedConfig(operationType, quality)
        configs.push(config)
      }
      
      // 网络质量越差，超时时间应该越长
      expect(configs[0].timeout).toBeLessThan(configs[1].timeout) // excellent < good
      expect(configs[1].timeout).toBeLessThan(configs[2].timeout) // good < fair
      expect(configs[2].timeout).toBeLessThan(configs[3].timeout) // fair < poor
    })
  })

  describe('属性2: 重试机制', () => {
    it('应该按照配置的次数进行重试', async () => {
      const maxRetries = 2 // 减少重试次数以加快测试
      let attemptCount = 0
      
      const failingOperation = (signal: AbortSignal) => {
        attemptCount++
        return Promise.reject(new Error(`Attempt ${attemptCount} failed`))
      }

      const result = await aiTimeoutRetryManager.executeWithTimeoutRetry(
        'inference',
        failingOperation,
        {
          customConfig: { 
            maxRetries,
            timeout: 5000,
            baseDelay: 10 // 快速重试用于测试
          }
        }
      )

      expect(result.success).toBe(false)
      expect(result.attempts).toBeGreaterThanOrEqual(maxRetries) // 至少重试指定次数
      expect(attemptCount).toBeGreaterThanOrEqual(maxRetries)
    })

    it('应该在成功时停止重试', async () => {
      let attemptCount = 0
      
      const eventuallySuccessfulOperation = (signal: AbortSignal) => {
        attemptCount++
        if (attemptCount < 3) {
          return Promise.reject(new Error(`Attempt ${attemptCount} failed`))
        }
        return Promise.resolve(`Success on attempt ${attemptCount}`)
      }

      const result = await aiTimeoutRetryManager.executeWithTimeoutRetry(
        'tts-load',
        eventuallySuccessfulOperation,
        {
          customConfig: { 
            maxRetries: 5,
            timeout: 5000,
            baseDelay: 10
          }
        }
      )

      expect(result.success).toBe(true)
      expect(result.attempts).toBe(3) // 应该在第3次尝试时成功
      expect(result.data).toBe('Success on attempt 3')
      expect(attemptCount).toBe(3)
    })

    it('应该实现指数退避延迟', async () => {
      const baseDelay = 100
      const backoffMultiplier = 2
      const maxDelay = 1000
      const jitterFactor = 0.1
      
      const delays: number[] = []
      
      for (let attempt = 0; attempt < 5; attempt++) {
        const delay = calculateBackoffDelay(attempt, baseDelay, maxDelay, backoffMultiplier, jitterFactor)
        delays.push(delay)
      }
      
      // 验证延迟递增
      expect(delays[1]).toBeGreaterThan(delays[0])
      expect(delays[2]).toBeGreaterThan(delays[1])
      expect(delays[3]).toBeGreaterThan(delays[2])
      
      // 验证不超过最大延迟
      delays.forEach(delay => {
        expect(delay).toBeLessThanOrEqual(maxDelay * 1.2) // 允许抖动
      })
      
      // 验证包含抖动
      const expectedDelays = delays.map((_, i) => 
        Math.min(baseDelay * Math.pow(backoffMultiplier, i), maxDelay)
      )
      
      delays.forEach((delay, i) => {
        const expected = expectedDelays[i]
        const jitterRange = expected * jitterFactor
        expect(delay).toBeGreaterThanOrEqual(expected - jitterRange)
        expect(delay).toBeLessThanOrEqual(expected + jitterRange * 2) // 抖动是加法
      })
    })

    it('应该调用重试回调函数', async () => {
      const onRetry = vi.fn()
      let attemptCount = 0
      
      const failingOperation = (signal: AbortSignal) => {
        attemptCount++
        return Promise.reject(new Error(`Attempt ${attemptCount} failed`))
      }

      await aiTimeoutRetryManager.executeWithTimeoutRetry(
        'cache-operation',
        failingOperation,
        {
          customConfig: { 
            maxRetries: 2,
            timeout: 1000,
            baseDelay: 10
          },
          onRetry
        }
      )

      expect(onRetry).toHaveBeenCalledTimes(2) // 2次重试
      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error), expect.any(Number))
      expect(onRetry).toHaveBeenCalledWith(2, expect.any(Error), expect.any(Number))
    })
  })

  describe('属性3: 进度报告', () => {
    it('应该报告操作进度', async () => {
      const onProgress = vi.fn()
      let attemptCount = 0
      
      const failingOperation = (signal: AbortSignal) => {
        attemptCount++
        return Promise.reject(new Error(`Attempt ${attemptCount} failed`))
      }

      await aiTimeoutRetryManager.executeWithTimeoutRetry(
        'library-load',
        failingOperation,
        {
          customConfig: { 
            maxRetries: 3,
            timeout: 1000,
            baseDelay: 10
          },
          onProgress
        }
      )

      expect(onProgress).toHaveBeenCalledTimes(4) // 初始尝试 + 3次重试
      expect(onProgress).toHaveBeenCalledWith(1, 4)
      expect(onProgress).toHaveBeenCalledWith(2, 4)
      expect(onProgress).toHaveBeenCalledWith(3, 4)
      expect(onProgress).toHaveBeenCalledWith(4, 4)
    })

    it('应该正确报告成功操作的进度', async () => {
      const onProgress = vi.fn()
      
      const successfulOperation = (signal: AbortSignal) => {
        return Promise.resolve('success')
      }

      const result = await aiTimeoutRetryManager.executeWithTimeoutRetry(
        'inference',
        successfulOperation,
        {
          customConfig: { 
            maxRetries: 3,
            timeout: 5000
          },
          onProgress
        }
      )

      expect(result.success).toBe(true)
      expect(onProgress).toHaveBeenCalledTimes(1) // 只有一次尝试
      expect(onProgress).toHaveBeenCalledWith(1, 4) // 1/4 (1次尝试，最多4次)
    })
  })

  describe('属性4: 操作取消', () => {
    it('应该能够取消正在进行的操作', async () => {
      const operationId = 'test-cancel-operation'
      
      const longRunningOperation = (signal: AbortSignal) => 
        new Promise<string>((resolve, reject) => {
          const timeoutId = setTimeout(() => resolve('completed'), 5000)
          
          signal.addEventListener('abort', () => {
            clearTimeout(timeoutId)
            reject(new Error('Operation cancelled'))
          })
        })

      // 启动操作但不等待
      const operationPromise = aiTimeoutRetryManager.executeWithTimeoutRetry(
        'model-load',
        longRunningOperation,
        {
          operationId,
          customConfig: { 
            timeout: 10000,
            maxRetries: 0
          }
        }
      )

      // 等待一小段时间确保操作开始
      await new Promise(resolve => setTimeout(resolve, 100))

      // 取消操作
      const cancelled = aiTimeoutRetryManager.cancelOperation(operationId)
      expect(cancelled).toBe(true)

      // 等待操作完成
      const result = await operationPromise

      expect(result.success).toBe(false)
      expect(result.error?.message).toContain('cancelled')
    })

    it('应该能够取消所有操作', async () => {
      const operations = []
      
      for (let i = 0; i < 3; i++) {
        const longRunningOperation = (signal: AbortSignal) => 
          new Promise<string>((resolve, reject) => {
            const timeoutId = setTimeout(() => resolve(`completed-${i}`), 5000)
            
            signal.addEventListener('abort', () => {
              clearTimeout(timeoutId)
              reject(new Error(`Operation ${i} cancelled`))
            })
          })

        operations.push(
          aiTimeoutRetryManager.executeWithTimeoutRetry(
            'inference',
            longRunningOperation,
            {
              operationId: `test-operation-${i}`,
              customConfig: { 
                timeout: 10000,
                maxRetries: 0
              }
            }
          )
        )
      }

      // 等待操作开始
      await new Promise(resolve => setTimeout(resolve, 100))

      // 检查活动操作数量
      expect(aiTimeoutRetryManager.getActiveOperationCount()).toBe(3)

      // 取消所有操作
      aiTimeoutRetryManager.cancelAllOperations()

      // 等待所有操作完成
      const results = await Promise.all(operations)

      results.forEach((result, i) => {
        expect(result.success).toBe(false)
        expect(result.error?.message).toContain('cancelled')
      })

      expect(aiTimeoutRetryManager.getActiveOperationCount()).toBe(0)
    })

    it('应该正确处理不存在的操作ID', () => {
      const cancelled = aiTimeoutRetryManager.cancelOperation('non-existent-id')
      expect(cancelled).toBe(false)
    })
  })

  describe('属性5: 错误分类和处理', () => {
    it('应该正确识别可重试的错误', () => {
      const retryableErrors = [
        new Error('Network timeout'),
        new Error('Connection failed'),
        new Error('Fetch error'),
        new Error('Load failed'),
        new Error('Operation aborted')
      ]

      const nonRetryableErrors = [
        new Error('Invalid argument'),
        new Error('Permission denied'),
        new Error('Not found'),
        new Error('Syntax error')
      ]

      retryableErrors.forEach(error => {
        expect(isRetryableError(error)).toBe(true)
      })

      nonRetryableErrors.forEach(error => {
        expect(isRetryableError(error)).toBe(false)
      })
    })

    it('应该为不同错误类型提供适当的处理', async () => {
      const { aiErrorHandler } = await import('@/utils/aiErrorHandler')
      
      const networkError = new Error('Network connection failed')
      
      const failingOperation = (signal: AbortSignal) => {
        return Promise.reject(networkError)
      }

      await aiTimeoutRetryManager.executeWithTimeoutRetry(
        'library-load',
        failingOperation,
        {
          customConfig: { 
            maxRetries: 1,
            timeout: 1000,
            baseDelay: 10
          }
        }
      )

      expect(aiErrorHandler.handleError).toHaveBeenCalledWith(
        networkError,
        expect.objectContaining({
          operation: 'library-load',
          attempts: 2
        })
      )
    })
  })

  describe('属性6: 性能监控集成', () => {
    it('应该报告成功操作的性能指标', async () => {
      const { performanceMonitor } = await import('@/utils/performanceMonitor')
      
      const successfulOperation = (signal: AbortSignal) => {
        return Promise.resolve('success')
      }

      const result = await aiTimeoutRetryManager.executeWithTimeoutRetry(
        'tts-load',
        successfulOperation,
        {
          customConfig: { 
            timeout: 5000,
            maxRetries: 2
          }
        }
      )

      expect(result.success).toBe(true)
      expect(performanceMonitor.reportMetric).toHaveBeenCalledWith(
        'ai_tts-load_success',
        expect.any(Number),
        expect.objectContaining({
          attempts: 1,
          networkQuality: 'good'
        })
      )
    })

    it('应该报告失败操作的性能指标', async () => {
      const { performanceMonitor } = await import('@/utils/performanceMonitor')
      
      const failingOperation = (signal: AbortSignal) => {
        return Promise.reject(new Error('Operation failed'))
      }

      const result = await aiTimeoutRetryManager.executeWithTimeoutRetry(
        'cache-operation',
        failingOperation,
        {
          customConfig: { 
            maxRetries: 1,
            timeout: 1000,
            baseDelay: 10
          }
        }
      )

      expect(result.success).toBe(false)
      expect(performanceMonitor.reportMetric).toHaveBeenCalledWith(
        'ai_cache-operation_failed',
        expect.any(Number),
        expect.objectContaining({
          attempts: 2,
          networkQuality: 'good',
          error: 'Operation failed'
        })
      )
    })

    it('应该报告超时事件', async () => {
      const { performanceMonitor } = await import('@/utils/performanceMonitor')
      
      const timeoutOperation = (signal: AbortSignal) => 
        new Promise<string>((resolve) => {
          setTimeout(() => resolve('too late'), 2000)
        })

      await aiTimeoutRetryManager.executeWithTimeoutRetry(
        'inference',
        timeoutOperation,
        {
          customConfig: { 
            timeout: 500,
            maxRetries: 0
          }
        }
      )

      expect(performanceMonitor.reportMetric).toHaveBeenCalledWith(
        'ai_inference_timeout',
        500,
        expect.objectContaining({
          attempts: 1,
          networkQuality: 'good'
        })
      )
    })
  })

  describe('属性7: 降级策略', () => {
    it('应该为离线状态提供降级建议', () => {
      const { networkDetector } = require('@/utils/networkOptimizer')
      vi.mocked(networkDetector.getNetworkQuality).mockReturnValue('offline')
      
      const operationTypes: AIOperationType[] = ['library-load', 'model-load', 'inference', 'tts-load', 'cache-operation']
      
      operationTypes.forEach(operationType => {
        const shouldDegrade = aiTimeoutRetryManager.shouldDegrade(operationType)
        const suggestion = aiTimeoutRetryManager.getDegradationSuggestion(operationType)
        
        expect(typeof shouldDegrade).toBe('boolean')
        expect(typeof suggestion).toBe('string')
        expect(suggestion.length).toBeGreaterThan(0)
        
        if (operationType === 'library-load' || operationType === 'model-load' || operationType === 'tts-load') {
          expect(shouldDegrade).toBe(true)
          expect(suggestion).toContain('离线')
        }
      })
    })

    it('应该为不同网络质量提供适当的建议', () => {
      const { networkDetector } = require('@/utils/networkOptimizer')
      const networkQualities = ['excellent', 'good', 'fair', 'poor', 'offline'] as const
      
      networkQualities.forEach(quality => {
        vi.mocked(networkDetector.getNetworkQuality).mockReturnValue(quality)
        
        const suggestion = aiTimeoutRetryManager.getDegradationSuggestion('model-load')
        expect(typeof suggestion).toBe('string')
        expect(suggestion.length).toBeGreaterThan(0)
        
        if (quality === 'offline') {
          expect(suggestion).toContain('离线')
        } else if (quality === 'poor') {
          expect(suggestion).toContain('较慢')
        }
      })
    })
  })

  describe('属性8: 工具函数', () => {
    it('createTimeoutPromise应该正确处理超时', async () => {
      const slowPromise = new Promise(resolve => setTimeout(() => resolve('success'), 2000))
      
      const startTime = Date.now()
      
      try {
        await createTimeoutPromise(slowPromise, 500)
        expect.fail('Should have timed out')
      } catch (error) {
        const endTime = Date.now()
        expect(error.message).toContain('timed out')
        expect(endTime - startTime).toBeGreaterThanOrEqual(450)
        expect(endTime - startTime).toBeLessThan(1000)
      }
    })

    it('createTimeoutPromise应该在Promise完成时正常返回', async () => {
      const fastPromise = Promise.resolve('success')
      
      const result = await createTimeoutPromise(fastPromise, 1000)
      expect(result).toBe('success')
    })

    it('calculateBackoffDelay应该产生合理的延迟', () => {
      const baseDelay = 100
      const maxDelay = 5000
      const backoffMultiplier = 2
      const jitterFactor = 0.1
      
      for (let attempt = 0; attempt < 10; attempt++) {
        const delay = calculateBackoffDelay(attempt, baseDelay, maxDelay, backoffMultiplier, jitterFactor)
        
        expect(delay).toBeGreaterThan(0)
        expect(delay).toBeLessThanOrEqual(maxDelay * 1.2) // 允许抖动
        
        if (attempt === 0) {
          expect(delay).toBeGreaterThanOrEqual(baseDelay * 0.9)
          expect(delay).toBeLessThanOrEqual(baseDelay * 1.2)
        }
      }
    })
  })

  describe('属性9: 边界条件和错误处理', () => {
    it('应该处理零重试配置', async () => {
      let attemptCount = 0
      
      const failingOperation = (signal: AbortSignal) => {
        attemptCount++
        return Promise.reject(new Error('Always fails'))
      }

      const result = await aiTimeoutRetryManager.executeWithTimeoutRetry(
        'cache-operation',
        failingOperation,
        {
          customConfig: { 
            maxRetries: 0,
            timeout: 1000
          }
        }
      )

      expect(result.success).toBe(false)
      expect(result.attempts).toBe(1)
      expect(attemptCount).toBe(1)
    })

    it('应该处理极短的超时时间', async () => {
      const operation = (signal: AbortSignal) => 
        new Promise<string>(resolve => setTimeout(() => resolve('success'), 100))

      const result = await aiTimeoutRetryManager.executeWithTimeoutRetry(
        'cache-operation',
        operation,
        {
          customConfig: { 
            timeout: 10, // 极短超时
            maxRetries: 0
          }
        }
      )

      expect(result.success).toBe(false)
      expect(result.error?.message).toContain('timed out')
    })

    it('应该处理操作中抛出的同步错误', async () => {
      const throwingOperation = (signal: AbortSignal) => {
        throw new Error('Synchronous error')
      }

      const result = await aiTimeoutRetryManager.executeWithTimeoutRetry(
        'inference',
        throwingOperation,
        {
          customConfig: { 
            maxRetries: 1,
            timeout: 1000,
            baseDelay: 10
          }
        }
      )

      expect(result.success).toBe(false)
      expect(result.attempts).toBe(2) // 初始尝试 + 1次重试
      expect(result.error?.message).toBe('Synchronous error')
    })

    it('应该处理大量并发操作', async () => {
      const operations = []
      const operationCount = 50
      
      for (let i = 0; i < operationCount; i++) {
        const operation = (signal: AbortSignal) => 
          new Promise<string>(resolve => 
            setTimeout(() => resolve(`result-${i}`), Math.random() * 100)
          )

        operations.push(
          aiTimeoutRetryManager.executeWithTimeoutRetry(
            'cache-operation',
            operation,
            {
              operationId: `concurrent-op-${i}`,
              customConfig: { 
                timeout: 1000,
                maxRetries: 0
              }
            }
          )
        )
      }

      const results = await Promise.all(operations)
      
      results.forEach((result, i) => {
        expect(result.success).toBe(true)
        expect(result.data).toBe(`result-${i}`)
      })

      expect(aiTimeoutRetryManager.getActiveOperationCount()).toBe(0)
    })
  })

  describe('属性10: 统计和监控', () => {
    it('应该正确跟踪活动操作数量', async () => {
      expect(aiTimeoutRetryManager.getActiveOperationCount()).toBe(0)
      
      const longOperation = (signal: AbortSignal) => 
        new Promise<string>(resolve => setTimeout(() => resolve('done'), 1000))

      const operationPromises = []
      
      // 启动多个操作
      for (let i = 0; i < 3; i++) {
        operationPromises.push(
          aiTimeoutRetryManager.executeWithTimeoutRetry(
            'inference',
            longOperation,
            {
              operationId: `tracking-op-${i}`,
              customConfig: { timeout: 2000, maxRetries: 0 }
            }
          )
        )
      }

      // 等待操作开始
      await new Promise(resolve => setTimeout(resolve, 100))
      expect(aiTimeoutRetryManager.getActiveOperationCount()).toBe(3)

      // 等待操作完成
      await Promise.all(operationPromises)
      expect(aiTimeoutRetryManager.getActiveOperationCount()).toBe(0)
    })

    it('应该提供操作统计信息', async () => {
      const operation = (signal: AbortSignal) => 
        Promise.resolve('success')

      const result = await aiTimeoutRetryManager.executeWithTimeoutRetry(
        'library-load',
        operation,
        {
          operationId: 'stats-test-op',
          customConfig: { timeout: 5000, maxRetries: 2 }
        }
      )

      expect(result.success).toBe(true)
      expect(result.attempts).toBe(1)
      expect(result.totalTime).toBeGreaterThan(0)
      expect(result.networkQuality).toBe('good')
    })
  })
})