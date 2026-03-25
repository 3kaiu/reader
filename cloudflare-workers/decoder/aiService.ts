/**
 * AI Service (AI 推理服务)
 * 职责：提供基于 LLM 的文本解密与推理，支持多模型兜底
 * 优化版本：模型缓存、提示工程优化、结果缓存
 */

import {
  callAIModel,
  getFallbackModels,
} from './ai-service/providers.ts'
import { generateCacheKey as buildCacheKey } from './ai-service/prompt.ts'
import {
  buildAIServiceStats,
  cleanupOldModelStats,
  getPreferredModel,
  trimCallTimestamps,
  updateTrackedModelStats,
} from './ai-service/stats.ts'
import type {
  AIInferContext,
  AIInferRequest,
  AIResponse,
  AIServiceStats,
  ModelStats,
} from './ai-service/types.ts'
import { type Logger } from '../shared/logger.ts'
import { SmartCache, SMART_CACHE_CONFIGS } from '../shared/smart-cache.ts'
import { type WorkerEnv } from '../shared/types.ts'

export type {
  AIEntityResult,
  AIInferContext,
  AIInferRequest,
  AIResponse,
} from './ai-service/types.ts'

export class AIService {
  private env: WorkerEnv
  private logger: Logger
  private cache: SmartCache
  private callCount = 0
  private static readonly MAX_CALLS_PER_MINUTE = 30
  private callTimestamps: number[] = []
  private maxTimestampsHistory = 100

  // 模型性能统计
  private modelStats = new Map<string, ModelStats>()
  private maxModelStats = 50

  constructor(env: WorkerEnv, logger: Logger) {
    this.env = env
    this.logger = logger
    this.cache = new SmartCache(env.AI_CACHE_KV!, SMART_CACHE_CONFIGS.DECODE_RESULTS)
  }

  async infer(request: AIInferRequest): Promise<AIResponse | null> {
    // 频率限制检查
    if (!this.checkRateLimit()) {
      this.logger.warn('AI rate limit exceeded')
      return null
    }

    this.callCount++
    const cacheKey = this.generateCacheKey(request)
    const analytics = this.env.ANALYTICS_ENGINE
    const cacheT0 = Date.now()
    const cached = await this.cache.get<AIResponse>(cacheKey)
    if (cached) {
      this.logger.info('AI cache hit for request')
      try {
        analytics?.writeDataPoint({
          blobs: ['ai', 'hit'],
          doubles: [Date.now() - cacheT0, 1.0],
          indexes: ['cache_metrics'],
        })
      } catch { }
      return cached
    }
    try {
      analytics?.writeDataPoint({
        blobs: ['ai', 'miss'],
        doubles: [Date.now() - cacheT0, 1.0],
        indexes: ['cache_metrics'],
      })
    } catch { }

    const result = await this.callAIWithFallback(request)
    if (result) {
      await this.cache.set(cacheKey, result)
      try {
        analytics?.writeDataPoint({
          blobs: ['ai', 'set'],
          doubles: [0, 1.0],
          indexes: ['cache_metrics'],
        })
      } catch { }
      this.updateModelStats(result.modelUsed, result.processingTime, result.tokensUsed, true)
    }

    return result
  }

  private generateCacheKey(request: AIInferRequest): string {
    return buildCacheKey(request)
  }

  private checkRateLimit(): boolean {
    const now = Date.now()
    this.callTimestamps = trimCallTimestamps(this.callTimestamps, now, this.maxTimestampsHistory)

    if (this.callTimestamps.length >= AIService.MAX_CALLS_PER_MINUTE) {
      return false
    }

    this.callTimestamps.push(now)
    return true
  }

  private async callAIWithFallback(request: AIInferRequest): Promise<AIResponse | null> {
    const startTime = Date.now()
    const preferredModel = getPreferredModel(this.modelStats)
    const providerContext = {
      env: this.env,
      logger: this.logger,
    }
    let result = await callAIModel(preferredModel, request, startTime, providerContext)

    // 如果首选模型失败，尝试其他模型
    if (!result) {
      const fallbackModels = getFallbackModels(preferredModel)
      for (const model of fallbackModels) {
        result = await callAIModel(model, request, startTime, providerContext)
        if (result) {
          break
        }
      }
    }

    return result
  }

  private updateModelStats(model: string, responseTime: number, tokensUsed: number, success: boolean): void {
    updateTrackedModelStats(this.modelStats, model, responseTime, tokensUsed, success)
    const cleanupResult = cleanupOldModelStats(this.modelStats, this.maxModelStats)
    this.modelStats = cleanupResult.modelStats
    const cleanedCount = cleanupResult.cleanedCount
    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} old AI model statistics`)
    }
  }

  // 获取AI服务统计信息
  getStats(): AIServiceStats {
    return buildAIServiceStats(
      this.callCount,
      this.callTimestamps,
      this.modelStats,
      this.cache.getStats(),
      AIService.MAX_CALLS_PER_MINUTE
    )
  }

  // 批量预热热门推理结果
  async prewarmCache(hotTerms: string[], context: AIInferContext): Promise<void> {
    const prewarmRequests: AIInferRequest[] = hotTerms.map(term => ({
      text: `请解释"${term}"在网文中的含义`,
      context,
      unknownTerms: [term],
    }))

    await this.cache.prewarm(prewarmRequests.map(req => this.generateCacheKey(req)))
  }
}
