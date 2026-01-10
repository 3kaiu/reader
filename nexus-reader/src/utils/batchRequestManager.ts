/**
 * Batch Request Manager - 批量请求管理器
 * 提供请求批处理、去重和优化功能
 */

import { requestOptimizer, networkDetector } from './networkOptimizer'
import { $get, type ApiResponse } from '../api/client'

// 批量请求配置
export interface BatchRequestConfig {
  batchSize: number
  batchDelay: number
  maxConcurrency: number
  timeout: number
  retryAttempts: number
}

// 批量请求项
export interface BatchRequestItem<T = any> {
  id: string
  url: string
  params?: Record<string, any>
  priority: number
  resolve: (value: ApiResponse<T>) => void
  reject: (error: Error) => void
  timestamp: number
}

// 批量响应结果
export interface BatchResponse<T = any> {
  success: Array<{ id: string; data: ApiResponse<T> }>
  failed: Array<{ id: string; error: Error }>
  totalTime: number
  networkQuality: string
}

/**
 * 批量请求管理器
 */
export class BatchRequestManager {
  private requestQueue: BatchRequestItem[] = []
  private processingBatch = false
  private batchTimer: number | null = null
  private activeRequests = new Set<string>()

  // 默认配置
  private defaultConfig: BatchRequestConfig = {
    batchSize: 5,
    batchDelay: 100,
    maxConcurrency: 3,
    timeout: 30000,
    retryAttempts: 2
  }

  constructor(config?: Partial<BatchRequestConfig>) {
    if (config) {
      this.defaultConfig = { ...this.defaultConfig, ...config }
    }
  }

  // 添加请求到批处理队列
  addRequest<T>(
    url: string, 
    params?: Record<string, any>, 
    priority = 5
  ): Promise<ApiResponse<T>> {
    return new Promise((resolve, reject) => {
      const id = this.generateRequestId(url, params)
      
      // 检查是否已有相同请求在处理中
      if (this.activeRequests.has(id)) {
        reject(new Error('Duplicate request already in progress'))
        return
      }

      const requestItem: BatchRequestItem<T> = {
        id,
        url,
        params,
        priority,
        resolve,
        reject,
        timestamp: Date.now()
      }

      this.requestQueue.push(requestItem)
      this.activeRequests.add(id)
      
      console.log(`📦 Request added to batch queue: ${url} (queue size: ${this.requestQueue.length})`)
      
      // 启动批处理定时器
      this.scheduleBatchProcessing()
    })
  }

  // 批量获取章节内容
  async batchGetChapters(chapterIds: string[]): Promise<BatchResponse> {
    const startTime = performance.now()
    const networkQuality = networkDetector.getNetworkQuality()
    
    console.log(`📚 Batch loading ${chapterIds.length} chapters (network: ${networkQuality})`)

    const requests = chapterIds.map(id => ({
      id,
      url: `/chapters/${id}`,
      priority: 8 // 章节内容高优先级
    }))

    const results = await this.processBatchRequests(requests)
    
    const totalTime = performance.now() - startTime
    
    // 报告性能指标
    if (window.performanceMonitor) {
      window.performanceMonitor.reportMetric('batch_chapters_load', totalTime, {
        chapterCount: chapterIds.length,
        successCount: results.success.length,
        failedCount: results.failed.length,
        networkQuality
      })
    }

    return {
      ...results,
      totalTime,
      networkQuality
    }
  }

  // 批量获取书籍信息
  async batchGetBooks(bookIds: string[]): Promise<BatchResponse> {
    const startTime = performance.now()
    const networkQuality = networkDetector.getNetworkQuality()
    
    console.log(`📖 Batch loading ${bookIds.length} books (network: ${networkQuality})`)

    const requests = bookIds.map(id => ({
      id,
      url: `/books/${id}`,
      priority: 6 // 书籍信息中等优先级
    }))

    const results = await this.processBatchRequests(requests)
    
    const totalTime = performance.now() - startTime
    
    // 报告性能指标
    if (window.performanceMonitor) {
      window.performanceMonitor.reportMetric('batch_books_load', totalTime, {
        bookCount: bookIds.length,
        successCount: results.success.length,
        failedCount: results.failed.length,
        networkQuality
      })
    }

    return {
      ...results,
      totalTime,
      networkQuality
    }
  }

  // 批量搜索
  async batchSearch(queries: string[]): Promise<BatchResponse> {
    const startTime = performance.now()
    const networkQuality = networkDetector.getNetworkQuality()
    
    console.log(`🔍 Batch search for ${queries.length} queries (network: ${networkQuality})`)

    const requests = queries.map((query, index) => ({
      id: `search_${index}`,
      url: '/search',
      params: { q: query },
      priority: 4 // 搜索低优先级
    }))

    const results = await this.processBatchRequests(requests)
    
    const totalTime = performance.now() - startTime
    
    // 报告性能指标
    if (window.performanceMonitor) {
      window.performanceMonitor.reportMetric('batch_search', totalTime, {
        queryCount: queries.length,
        successCount: results.success.length,
        failedCount: results.failed.length,
        networkQuality
      })
    }

    return {
      ...results,
      totalTime,
      networkQuality
    }
  }

  // 获取队列状态
  getQueueStatus() {
    return {
      queueSize: this.requestQueue.length,
      activeRequests: this.activeRequests.size,
      isProcessing: this.processingBatch,
      nextBatchIn: this.batchTimer ? this.defaultConfig.batchDelay : 0
    }
  }

  // 清空队列
  clearQueue() {
    // 拒绝所有待处理的请求
    this.requestQueue.forEach(item => {
      item.reject(new Error('Queue cleared'))
      this.activeRequests.delete(item.id)
    })
    
    this.requestQueue = []
    
    if (this.batchTimer) {
      clearTimeout(this.batchTimer)
      this.batchTimer = null
    }
    
    console.log('📦 Batch request queue cleared')
  }

  // 更新配置
  updateConfig(config: Partial<BatchRequestConfig>) {
    this.defaultConfig = { ...this.defaultConfig, ...config }
    console.log('⚙️ Batch request config updated:', this.defaultConfig)
  }

  private async processBatchRequests(
    requests: Array<{ id: string; url: string; params?: Record<string, any>; priority: number }>
  ): Promise<{ success: Array<{ id: string; data: any }>; failed: Array<{ id: string; error: Error }> }> {
    const success: Array<{ id: string; data: any }> = []
    const failed: Array<{ id: string; error: Error }> = []

    // 根据网络质量调整批处理配置
    const networkQuality = networkDetector.getNetworkQuality()
    const config = this.getConfigForNetworkQuality(networkQuality)

    // 按优先级排序
    const sortedRequests = requests.sort((a, b) => b.priority - a.priority)

    // 分批处理
    for (let i = 0; i < sortedRequests.length; i += config.batchSize) {
      const batch = sortedRequests.slice(i, i + config.batchSize)
      
      const batchPromises = batch.map(async (request) => {
        try {
          const response = await requestOptimizer.requestWithRetry(
            () => $get(request.url, { params: request.params }),
            { timeout: config.timeout, maxRetries: config.retryAttempts }
          )
          
          success.push({ id: request.id, data: response })
        } catch (error) {
          failed.push({ id: request.id, error: error as Error })
        }
      })

      await Promise.all(batchPromises)

      // 批次间延迟
      if (i + config.batchSize < sortedRequests.length) {
        await new Promise(resolve => setTimeout(resolve, config.batchDelay))
      }
    }

    return { success, failed }
  }

  private scheduleBatchProcessing() {
    if (this.batchTimer || this.processingBatch) {
      return
    }

    this.batchTimer = window.setTimeout(() => {
      this.processBatch()
    }, this.defaultConfig.batchDelay)
  }

  private async processBatch() {
    if (this.processingBatch || this.requestQueue.length === 0) {
      return
    }

    this.processingBatch = true
    this.batchTimer = null

    try {
      // 根据网络质量调整批处理大小
      const networkQuality = networkDetector.getNetworkQuality()
      const config = this.getConfigForNetworkQuality(networkQuality)
      
      // 按优先级排序
      const sortedQueue = [...this.requestQueue].sort((a, b) => b.priority - a.priority)
      
      // 取出一批请求
      const batchSize = Math.min(config.batchSize, sortedQueue.length)
      const batch = sortedQueue.slice(0, batchSize)
      
      // 从队列中移除这些请求
      batch.forEach(item => {
        const index = this.requestQueue.findIndex(q => q.id === item.id)
        if (index > -1) {
          this.requestQueue.splice(index, 1)
        }
      })

      console.log(`📦 Processing batch of ${batch.length} requests (network: ${networkQuality})`)

      // 并发处理批次中的请求
      const batchPromises = batch.map(async (item) => {
        try {
          const response = await requestOptimizer.requestWithRetry(
            () => $get(item.url, { params: item.params }),
            { timeout: config.timeout, maxRetries: config.retryAttempts }
          )
          
          item.resolve(response)
        } catch (error) {
          item.reject(error as Error)
        } finally {
          this.activeRequests.delete(item.id)
        }
      })

      await Promise.all(batchPromises)

      // 如果还有请求在队列中，继续处理
      if (this.requestQueue.length > 0) {
        setTimeout(() => {
          this.processBatch()
        }, config.batchDelay)
      }

    } catch (error) {
      console.error('📦 Batch processing error:', error)
      
      // 清理失败的请求
      this.requestQueue.forEach(item => {
        item.reject(new Error('Batch processing failed'))
        this.activeRequests.delete(item.id)
      })
      this.requestQueue = []
      
    } finally {
      this.processingBatch = false
    }
  }

  private getConfigForNetworkQuality(networkQuality: string): BatchRequestConfig {
    const configs = {
      excellent: {
        batchSize: 10,
        batchDelay: 50,
        maxConcurrency: 5,
        timeout: 10000,
        retryAttempts: 2
      },
      good: {
        batchSize: 8,
        batchDelay: 100,
        maxConcurrency: 4,
        timeout: 15000,
        retryAttempts: 2
      },
      fair: {
        batchSize: 5,
        batchDelay: 200,
        maxConcurrency: 3,
        timeout: 20000,
        retryAttempts: 3
      },
      poor: {
        batchSize: 3,
        batchDelay: 500,
        maxConcurrency: 2,
        timeout: 30000,
        retryAttempts: 4
      },
      offline: {
        batchSize: 1,
        batchDelay: 1000,
        maxConcurrency: 1,
        timeout: 5000,
        retryAttempts: 0
      }
    }

    return configs[networkQuality as keyof typeof configs] || this.defaultConfig
  }

  private generateRequestId(url: string, params?: Record<string, any>): string {
    const paramStr = params ? JSON.stringify(params) : ''
    return `${url}_${paramStr}`.replace(/[^a-zA-Z0-9]/g, '_')
  }
}

// 全局批量请求管理器实例
export const batchRequestManager = new BatchRequestManager()

// 自动调整配置基于网络变化
if (typeof window !== 'undefined') {
  networkDetector.addNetworkChangeListener((info) => {
    const networkQuality = networkDetector.getNetworkQuality()
    
    // 根据网络质量调整批处理配置
    const configs = {
      excellent: { batchSize: 10, batchDelay: 50 },
      good: { batchSize: 8, batchDelay: 100 },
      fair: { batchSize: 5, batchDelay: 200 },
      poor: { batchSize: 3, batchDelay: 500 },
      offline: { batchSize: 1, batchDelay: 1000 }
    }

    const config = configs[networkQuality as keyof typeof configs]
    if (config) {
      batchRequestManager.updateConfig(config)
    }
  })

  // 页面卸载时清空队列
  window.addEventListener('beforeunload', () => {
    batchRequestManager.clearQueue()
  })
}

// 便捷函数
export function batchGetChapters(chapterIds: string[]) {
  return batchRequestManager.batchGetChapters(chapterIds)
}

export function batchGetBooks(bookIds: string[]) {
  return batchRequestManager.batchGetBooks(bookIds)
}

export function batchSearch(queries: string[]) {
  return batchRequestManager.batchSearch(queries)
}

// 类型声明扩展
declare global {
  interface Window {
    performanceMonitor?: {
      reportMetric: (name: string, value: number, context?: any) => void
    }
  }
}