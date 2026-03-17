/**
 * AI Service (AI 推理服务)
 * 职责：提供基于 LLM 的文本解密与推理，支持多模型兜底
 * 优化版本：模型缓存、提示工程优化、结果缓存
 */

import { SmartCache, SMART_CACHE_CONFIGS } from '../shared/smart-cache.ts';
import { type WorkerEnv } from '../shared/types.ts';
import { type Logger } from '../shared/logger.ts';

export interface AIInferRequest {
  text: string;
  context: any;
  unknownTerms: string[];
  bookId?: string;
  chapterId?: string;
}

export interface AIResponse {
  entities: Array<{
    original: string;
    real: string;
    type: string;
    confidence: number;
    position: { start: number; end: number };
  }>;
  processingTime: number;
  modelUsed: string;
  tokensUsed: number;
}

export class AIService {
  private env: WorkerEnv;
  private logger: Logger;
  private cache: SmartCache;
  private callCount = 0;
  private static readonly MAX_CALLS_PER_MINUTE = 30;
  private callTimestamps: number[] = [];
  private maxTimestampsHistory = 100; // 限制时间戳历史长度

  // 模型性能统计
  private modelStats = new Map<string, {
    totalCalls: number;
    successfulCalls: number;
    avgResponseTime: number;
    avgTokens: number;
    lastUsed: number;
  }>();
  private maxModelStats = 50; // 限制模型统计数量

  constructor(env: WorkerEnv, logger: Logger) {
    this.env = env;
    this.logger = logger;
    this.cache = new SmartCache(env.AI_CACHE_KV!, SMART_CACHE_CONFIGS.DECODE_RESULTS);
  }

  async infer(request: AIInferRequest): Promise<AIResponse | null> {
    // 频率限制检查
    if (!this.checkRateLimit()) {
      this.logger.warn('AI rate limit exceeded');
      return null;
    }

    const cacheKey = this.generateCacheKey(request);
    const analytics = (this.env as any).ANALYTICS_ENGINE;
    const cacheT0 = Date.now();
    const cached = await this.cache.get<AIResponse>(cacheKey);
    if (cached) {
      this.logger.info('AI cache hit for request');
      try {
        analytics?.writeDataPoint({
          blobs: ['ai', 'hit'],
          doubles: [Date.now() - cacheT0, 1.0],
          indexes: ['cache_metrics'],
        });
      } catch { }
      return cached;
    }
    try {
      analytics?.writeDataPoint({
        blobs: ['ai', 'miss'],
        doubles: [Date.now() - cacheT0, 1.0],
        indexes: ['cache_metrics'],
      });
    } catch { }

    const result = await this.callAIWithFallback(request);
    if (result) {
      await this.cache.set(cacheKey, result);
      try {
        analytics?.writeDataPoint({
          blobs: ['ai', 'set'],
          doubles: [0, 1.0],
          indexes: ['cache_metrics'],
        });
      } catch { }
      this.updateModelStats(result.modelUsed, result.processingTime, result.tokensUsed, true);
    }

    return result;
  }

  private generateCacheKey(request: AIInferRequest): string {
    // 生成稳定的缓存键，忽略不可序列化的字段
    const keyData = {
      text: request.text.slice(0, 1000), // 限制文本长度
      context: request.context,
      unknownTerms: request.unknownTerms.slice(0, 10), // 限制关键词数量
      bookId: request.bookId,
      chapterId: request.chapterId
    };
    return `ai:${btoa(JSON.stringify(keyData)).slice(0, 100)}`;
  }

  private checkRateLimit(): boolean {
    const now = Date.now();

    // 清理一分钟前的记录
    this.callTimestamps = this.callTimestamps.filter(ts => now - ts < 60000);

    // 限制时间戳数组大小
    if (this.callTimestamps.length > this.maxTimestampsHistory) {
      this.callTimestamps = this.callTimestamps.slice(-this.maxTimestampsHistory);
    }

    if (this.callTimestamps.length >= AIService.MAX_CALLS_PER_MINUTE) {
      return false;
    }

    this.callTimestamps.push(now);
    return true;
  }

  private async callAIWithFallback(request: AIInferRequest): Promise<AIResponse | null> {
    const startTime = Date.now();

    // 优先使用性能最好的模型
    const preferredModel = this.getPreferredModel();
    let result: AIResponse | null = null;

    switch (preferredModel) {
      case 'workers-ai':
        result = await this.callWorkersAI(request, startTime);
        break;
      case 'groq':
        result = await this.callGroq(request, startTime);
        break;
      case 'huggingface':
        result = await this.callHuggingFace(request, startTime);
        break;
    }

    // 如果首选模型失败，尝试其他模型
    if (!result) {
      const fallbackModels = ['workers-ai', 'groq', 'huggingface'].filter(m => m !== preferredModel);
      for (const model of fallbackModels) {
        switch (model) {
          case 'workers-ai':
            result = await this.callWorkersAI(request, startTime);
            break;
          case 'groq':
            result = await this.callGroq(request, startTime);
            break;
          case 'huggingface':
            result = await this.callHuggingFace(request, startTime);
            break;
        }
        if (result) break;
      }
    }

    return result;
  }

  private getPreferredModel(): string {
    // 基于历史性能选择最佳模型
    let bestModel = 'workers-ai';
    let bestScore = 0;

    for (const [model, stats] of this.modelStats) {
      if (stats.totalCalls < 5) continue; // 需要足够样本

      const successRate = stats.successfulCalls / stats.totalCalls;
      const avgResponseTime = stats.avgResponseTime;
      const score = successRate * 1000 / avgResponseTime; // 综合评分

      if (score > bestScore) {
        bestScore = score;
        bestModel = model;
      }
    }

    return bestModel;
  }

  private updateModelStats(model: string, responseTime: number, tokensUsed: number, success: boolean): void {
    const stats = this.modelStats.get(model) || {
      totalCalls: 0,
      successfulCalls: 0,
      avgResponseTime: 0,
      avgTokens: 0,
      lastUsed: 0
    };

    stats.totalCalls++;
    if (success) stats.successfulCalls++;

    // 指数移动平均
    const alpha = 0.1;
    stats.avgResponseTime = stats.avgResponseTime * (1 - alpha) + responseTime * alpha;
    stats.avgTokens = stats.avgTokens * (1 - alpha) + tokensUsed * alpha;
    stats.lastUsed = Date.now();

    this.modelStats.set(model, stats);

    // 清理过期的模型统计
    this.cleanupOldModelStats();
  }

  private cleanupOldModelStats(): void {
    if (this.modelStats.size <= this.maxModelStats) {
      return;
    }

    // 按最后使用时间排序，保留最新的
    const entries = Array.from(this.modelStats.entries());
    entries.sort((a, b) => b[1].lastUsed - a[1].lastUsed);

    // 清理最旧的统计
    const keepCount = Math.floor(this.maxModelStats * 0.8); // 保留80%
    const newStats = new Map<string, {
      totalCalls: number;
      successfulCalls: number;
      avgResponseTime: number;
      avgTokens: number;
      lastUsed: number;
    }>();

    for (let i = 0; i < Math.min(keepCount, entries.length); i++) {
      newStats.set(entries[i][0], entries[i][1]);
    }

    const cleanedCount = this.modelStats.size - newStats.size;
    this.modelStats = newStats;

    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} old AI model statistics`);
    }
  }

  private buildOptimizedPrompt(request: AIInferRequest): string {
    const { text, context, unknownTerms } = request;

    // 优化后的提示词，更精确和结构化
    const prompt = `你是一个专业的中文网文解密专家。请分析以下文本中的潜在暗语、代称或隐晦表达，并给出其真实含义。

文本内容（${text.length}字符）：
${text.slice(0, 2000)}

上下文信息：
- 类型：${context.bookType || '通用'}
- 需要关注的关键词：${unknownTerms.slice(0, 20).join('、')}

要求：
1. 只识别真正存在暗语或代称的部分
2. 提供准确的真实含义
3. 按JSON格式返回结果

输出格式：
{
  "entities": [
    {
      "original": "原文中的暗语",
      "real": "真实含义",
      "type": "person|company|place|organization|other",
      "confidence": 0.0-1.0,
      "reason": "识别依据的简要说明"
    }
  ]
}

如果没有发现暗语，请返回 {"entities": []}`;

    return prompt;
  }

  private async callWorkersAI(request: AIInferRequest, startTime: number): Promise<AIResponse | null> {
    if (!this.env.AI) return null;

    try {
      const prompt = this.buildOptimizedPrompt(request);
      const response = await this.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        prompt,
        max_tokens: 1000,
        temperature: 0.1 // 降低随机性，提高准确性
      });

      const result = this.parseJSON(response.response || response);
      if (!result) return null;

      return {
        entities: result.entities || [],
        processingTime: Date.now() - startTime,
        modelUsed: 'workers-ai',
        tokensUsed: (response.usage?.total_tokens) || prompt.length / 4
      };
    } catch (e) {
      this.logger.error('Workers AI failed:', e);
      return null;
    }
  }

  private async callGroq(request: AIInferRequest, startTime: number): Promise<AIResponse | null> {
    if (!this.env.GROQ_API_KEY) return null;

    try {
      const prompt = this.buildOptimizedPrompt(request);
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.1-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1000,
          temperature: 0.1,
          response_format: { type: 'json_object' }
        })
      });

      const data: any = await response.json();
      if (!data.choices?.[0]?.message?.content) return null;

      const result = this.parseJSON(data.choices[0].message.content);
      if (!result) return null;

      return {
        entities: result.entities || [],
        processingTime: Date.now() - startTime,
        modelUsed: 'groq',
        tokensUsed: data.usage?.total_tokens || prompt.length / 4
      };
    } catch (e) {
      this.logger.error('Groq AI failed:', e);
      return null;
    }
  }

  private async callHuggingFace(request: AIInferRequest, startTime: number): Promise<AIResponse | null> {
    if (!this.env.HF_API_KEY) return null;

    try {
      const prompt = this.buildOptimizedPrompt(request);
      const response = await fetch('https://api-inference.huggingface.co/models/meta-llama/Llama-2-7b-chat-hf', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.env.HF_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            max_new_tokens: 1000,
            temperature: 0.1,
            do_sample: false
          }
        })
      });

      const data: any = await response.json();
      const result = this.parseJSON(data[0]?.generated_text || data);
      if (!result) return null;

      return {
        entities: result.entities || [],
        processingTime: Date.now() - startTime,
        modelUsed: 'huggingface',
        tokensUsed: prompt.length / 4 // 估算
      };
    } catch (e) {
      this.logger.error('HuggingFace AI failed:', e);
      return null;
    }
  }

  private parseJSON(response: any): any {
    if (!response) return null;

    try {
      const text = typeof response === 'string' ? response : JSON.stringify(response);

      // 提取JSON部分
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]);

      // 验证结构
      if (!parsed.entities || !Array.isArray(parsed.entities)) {
        return null;
      }

      // 过滤和验证实体
      parsed.entities = parsed.entities.filter((entity: any) => {
        return entity.original && entity.real && entity.type &&
          typeof entity.confidence === 'number' &&
          entity.confidence >= 0.1; // 最低置信度阈值
      });

      return parsed;
    } catch {
      return null;
    }
  }

  // 获取AI服务统计信息
  getStats(): {
    totalCalls: number;
    modelStats: Record<string, any>;
    cacheStats: any;
    rateLimitRemaining: number;
  } {
    const now = Date.now();
    const recentCalls = this.callTimestamps.filter(ts => now - ts < 60000).length;
    const remaining = Math.max(0, AIService.MAX_CALLS_PER_MINUTE - recentCalls);

    return {
      totalCalls: this.callCount,
      modelStats: Object.fromEntries(this.modelStats),
      cacheStats: this.cache.getStats(),
      rateLimitRemaining: remaining
    };
  }

  // 批量预热热门推理结果
  async prewarmCache(hotTerms: string[], context: any): Promise<void> {
    const prewarmRequests: AIInferRequest[] = hotTerms.map(term => ({
      text: `请解释"${term}"在网文中的含义`,
      context,
      unknownTerms: [term]
    }));

    await this.cache.prewarm(prewarmRequests.map(req => this.generateCacheKey(req)));
  }
}