/**
 * Decoder Engine (解码引擎)
 * 优化版本：集成性能监控、智能缓存、多层解码策略
 */

import { verifyAuth } from '../shared/auth.ts';
import { createLogger, type Logger } from '../shared/logger.ts';
import { SmartCache, SMART_CACHE_CONFIGS } from '../shared/smart-cache.ts';
import { getPerformanceMonitor, withPerformanceMonitoring } from '../shared/performance-monitor.ts';
import {
  type DecodeRequest,
  type DecodeResponse,
  type DecodedEntity,
  type ChapterContext,
  type WorkerEnv
} from '../shared/types.ts';

// 导入优化后的服务
import { DictionaryService } from './dictionaryService.ts';
import { AIService } from './aiService.ts';
import { KnowledgeGraphService } from './knowledgeGraphService.ts';

/** 解码引擎 (Orchestrator) */
export class DecoderEngine {
  private dictionary: DictionaryService;
  private kg: KnowledgeGraphService;
  private ai: AIService;
  private cache: SmartCache;
  private logger: Logger;
  private env: WorkerEnv;

  constructor(env: WorkerEnv) {
    this.env = env;
    this.logger = createLogger(env);
    this.dictionary = new DictionaryService(env, this.logger);
    this.kg = new KnowledgeGraphService(env, this.logger);
    this.ai = new AIService(env, this.logger);
    this.cache = new SmartCache(env.DECODER_KV!, {
      ...SMART_CACHE_CONFIGS.DECODE_RESULTS,
      prewarmEnabled: true, // 启用智能预热
      adaptiveTTL: true     // 启用自适应TTL
    });
  }

  @withPerformanceMonitoring('decode_init')
  async init(bookId?: string, bookType?: any) {
    await Promise.all([
      this.dictionary.load(bookId, bookType),
      this.kg.load()
    ]);

    // 预热热门词汇缓存
    const hotTerms = this.dictionary.getHotTerms().global.slice(0, 20);
    if (hotTerms.length > 0) {
      await this.ai.prewarmCache(hotTerms, { bookType });
    }
  }

  @withPerformanceMonitoring('decode_process')
  async decode(request: DecodeRequest): Promise<DecodeResponse> {
    const { content, bookId, chapterId, bookMeta } = request;
    const monitor = getPerformanceMonitor();

    // 检查缓存
    const cacheKey = `decode:${bookId}:${chapterId}:${this.hashContent(content)}`;
    const analytics = (this.env as any).ANALYTICS_ENGINE;
    const cacheT0 = Date.now();
    const cached = await this.cache.get<DecodeResponse>(cacheKey);
    if (cached) {
      monitor.record('decode_cache_hit', 0, true);
      try {
        analytics?.writeDataPoint({
          blobs: ['decoder', 'hit'],
          doubles: [Date.now() - cacheT0, 1.0],
          indexes: ['cache_metrics'],
        });
      } catch { }
      return cached;
    }
    try {
      analytics?.writeDataPoint({
        blobs: ['decoder', 'miss'],
        doubles: [Date.now() - cacheT0, 1.0],
        indexes: ['cache_metrics'],
      });
    } catch { }

    await this.init(bookId, bookMeta?.type);

    const startTime = Date.now();

    // 1. 提取潜在词汇并匹配
    const potentialTerms = this.extractPotentialTerms(content);
    const entities: DecodedEntity[] = [];
    const matchedRanges: [number, number][] = [];

    monitor.record('term_extraction', Date.now() - startTime, true, {
      contentLength: content.length,
      potentialTermsCount: potentialTerms.length
    });

    // 并发生成所有匹配任务
    const matchPromises = potentialTerms.map(async ({ term, start, end }) => {
      const entity = await this.matchTermOptimized(term, start, end, bookId, bookMeta?.type);
      return { entity, start, end };
    });

    const matchResults = await Promise.all(matchPromises);

    for (const { entity, start, end } of matchResults) {
      if (entity) {
        entities.push(entity);
        matchedRanges.push([start, end]);
      }
    }

    monitor.record('dictionary_matching', Date.now() - startTime, true, {
      matchedEntities: entities.length
    });

    // 2. AI Fallback: 处理未匹配的关键片段
    if (entities.length < 3 && content.length > 50) {
      const aiEntities = await this.aiLookupFallbackOptimized(content, matchedRanges, bookId, chapterId);
      entities.push(...aiEntities);

      monitor.record('ai_fallback', Date.now() - startTime, true, {
        aiEntitiesCount: aiEntities.length
      });
    }

    const result: DecodeResponse = {
      chapterId,
      entities,
      context: {
        timeContext: { confidence: 0 },
        locationContext: { confidence: 0 },
        industryContext: [],
        identifiedEntities: entities.map(e => e.bestMatch.real)
      },
      cached: false
    };

    // 缓存结果（异步）
    this.cache.set(cacheKey, result).catch(err =>
      this.logger.warn('Failed to cache decode result:', err)
    );
    try {
      analytics?.writeDataPoint({
        blobs: ['decoder', 'set'],
        doubles: [0, 1.0],
        indexes: ['cache_metrics'],
      });
    } catch { }

    monitor.record('decode_total', Date.now() - startTime, true, {
      finalEntitiesCount: entities.length,
      contentLength: content.length
    });

    return result;
  }

  private hashContent(content: string): string {
    // 简单的哈希函数，用于缓存键
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    return Math.abs(hash).toString(36);
  }

  private async matchTermOptimized(term: string, start: number, end: number, bookId?: string, bookType?: any): Promise<DecodedEntity | null> {
    // 并行检查多个数据源
    const [dictResult, kgResult, aiResult] = await Promise.allSettled([
      Promise.resolve(this.dictionary.lookup(term, bookId, bookType)),
      Promise.resolve(this.kg.findEntity(term)),
      this.dictionary.lookupAsync(term)
    ]);

    // 优先级：词典 > KG > AI缓存
    if (dictResult.status === 'fulfilled' && dictResult.value) {
      return this.buildEntity(term, start, end, dictResult.value.real, 'dictionary', 95);
    }

    if (kgResult.status === 'fulfilled' && kgResult.value) {
      return this.buildEntity(term, start, end, kgResult.value.realName || kgResult.value.name, 'knowledge_graph', 90);
    }

    if (aiResult.status === 'fulfilled' && aiResult.value) {
      return this.buildEntity(term, start, end, aiResult.value.real, 'ai_cache', 85);
    }

    return null;
  }

  private extractPotentialTerms(content: string): { term: string, start: number, end: number }[] {
    const MAX_TERM_LEN = 8; // 减少最大长度，提高性能
    const MIN_TERM_LEN = 2;
    const results: { term: string, start: number, end: number }[] = [];
    const processed = new Set<string>(); // 避免重复处理

    for (let i = 0; i < content.length; i++) {
      // 优化：只检查可能有意义的词汇模式
      if (!this.isPotentialTermStart(content[i])) continue;

      // 最大匹配优化
      for (let len = MAX_TERM_LEN; len >= MIN_TERM_LEN; len--) {
        if (i + len > content.length) continue;
        const term = content.substring(i, i + len);

        if (processed.has(term)) continue;

        // 快速预过滤
        if (this.quickPreCheck(term)) {
          // 并行检查是否存在于数据源
          const exists = this.dictionary.lookup(term) || this.kg.findEntity(term);
          if (exists) {
            results.push({ term, start: i, end: i + len });
            processed.add(term);
            i += len - 1; // 跳过已匹配部分
            break;
          }
        }
      }
    }

    return results;
  }

  private isPotentialTermStart(char: string): boolean {
    // 快速检查字符是否可能是术语开头
    return /[\u4e00-\u9fa5a-zA-Z]/.test(char); // 中英文字符
  }

  private quickPreCheck(term: string): boolean {
    // 快速预检查，过滤明显不可能的词汇
    if (term.length < 2) return false;
    if (/^\d+$/.test(term)) return false; // 纯数字
    if (/^[a-zA-Z]+$/.test(term) && term.length > 6) return false; // 过长的英文单词
    return true;
  }

  private async aiLookupFallbackOptimized(
    content: string,
    matchedRanges: [number, number][],
    bookId?: string,
    chapterId?: string
  ): Promise<DecodedEntity[]> {
    try {
      // 优化：提取更精确的未知词汇
      const unknownSegments = this.extractUnknownSegments(content, matchedRanges);
      if (unknownSegments.length === 0) return [];

      const aiRequest = {
        text: unknownSegments.join('\n'),
        context: { bookType: 'generic', bookId, chapterId },
        unknownTerms: this.extractPotentialKeywords(content),
        bookId,
        chapterId
      };

      const aiResult = await this.ai.infer(aiRequest);

      if (aiResult?.entities) {
        return aiResult.entities.map((e: any) => ({
          id: crypto.randomUUID(),
          original: e.original,
          position: { start: -1, end: -1 },
          candidates: [{ real: e.real, confidence: Math.min(80, e.confidence * 100), category: e.type || 'person' }],
          bestMatch: { real: e.real, confidence: Math.min(80, e.confidence * 100), category: e.type || 'person' },
          source: 'ai'
        }));
      }
    } catch (e) {
      this.logger.error('AI Fallback failed:', e);
    }
    return [];
  }

  private extractUnknownSegments(content: string, matchedRanges: [number, number][]): string[] {
    if (matchedRanges.length === 0) {
      // 如果没有已知匹配，取中间段落
      const middle = Math.floor(content.length / 2);
      const segment = content.substring(Math.max(0, middle - 200), Math.min(content.length, middle + 200));
      return [segment];
    }

    // 提取未匹配的段落
    const segments: string[] = [];
    let lastEnd = 0;

    for (const [start, end] of matchedRanges) {
      if (start - lastEnd > 50) { // 有足够长的未匹配内容
        const segment = content.substring(lastEnd, start);
        if (segment.length > 20) {
          segments.push(segment);
        }
      }
      lastEnd = end;
    }

    // 最后的未匹配部分
    if (content.length - lastEnd > 50) {
      const segment = content.substring(lastEnd);
      if (segment.length > 20) {
        segments.push(segment);
      }
    }

    return segments.slice(0, 3); // 最多3个段落
  }

  private extractPotentialKeywords(content: string): string[] {
    // 提取可能的关键词（名词、专有名词等）
    const words = content.split(/[^\u4e00-\u9fa5a-zA-Z]+/).filter(word =>
      word.length >= 2 && word.length <= 6 &&
      /[\u4e00-\u9fa5]/.test(word) // 包含中文字符
    );

    // 统计词频，取最常见的
    const freq = new Map<string, number>();
    for (const word of words) {
      freq.set(word, (freq.get(word) || 0) + 1);
    }

    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  private buildEntity(original: string, start: number, end: number, real: string, source: any, confidence: number = 90): DecodedEntity {
    return {
      id: crypto.randomUUID(),
      original,
      position: { start, end },
      candidates: [{ real, confidence, category: 'person' }],
      bestMatch: { real, confidence, category: 'person' },
      source
    };
  }

  // 获取引擎统计信息
  getStats() {
    return {
      dictionary: this.dictionary.getStats(),
      ai: this.ai.getStats(),
      cache: this.cache.getStats(),
      performance: getPerformanceMonitor().getAggregatedMetrics()
    };
  }
}