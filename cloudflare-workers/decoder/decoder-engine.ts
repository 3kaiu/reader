/**
 * Decoder Engine (解码引擎)
 * 优化版本：集成性能监控、智能缓存、多层解码策略
 */

import { verifyAuth } from '../shared/auth.ts';
import { createLogger, type Logger } from '../shared/logger.ts';
import { SmartCache, SMART_CACHE_CONFIGS } from '../shared/smart-cache.ts';
import { getPerformanceMonitor, withPerformanceMonitoring } from '../shared/performance-monitor.ts';
import {
  type BookType,
  type DecodeRequest,
  type DecodeResponse,
  type DecodedEntity,
  type WorkerEnv
} from '../shared/types.ts';
import {
  buildAIInferRequest,
  mapAIEntitiesToDecoded,
} from './decoder-engine/aiFallback.ts';
import {
  buildEntity,
  hashContent,
} from './decoder-engine/helpers.ts';
import {
  createDecodeResponse,
  type MatchedRange,
} from './decoder-engine/types.ts';
import { extractPotentialTerms } from './decoder-engine/termExtraction.ts';

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
  async init(bookId?: string, bookType?: BookType) {
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
    const cacheKey = `decode:${bookId}:${chapterId}:${hashContent(content)}`;
    const analytics = this.env.ANALYTICS_ENGINE;
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
    const potentialTerms = extractPotentialTerms(content, {
      hasMatch: (term) => Boolean(this.dictionary.lookup(term) || this.kg.findEntity(term)),
    });
    const entities: DecodedEntity[] = [];
    const matchedRanges: MatchedRange[] = [];

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

    const result = createDecodeResponse(chapterId, entities);

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

  private async matchTermOptimized(
    term: string,
    start: number,
    end: number,
    bookId?: string,
    bookType?: BookType
  ): Promise<DecodedEntity | null> {
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
      return this.buildEntity(term, start, end, aiResult.value.real, 'ai', 85);
    }

    return null;
  }

  private async aiLookupFallbackOptimized(
    content: string,
    matchedRanges: MatchedRange[],
    bookId?: string,
    chapterId?: string
  ): Promise<DecodedEntity[]> {
    try {
      const aiRequest = buildAIInferRequest({
        content,
        bookId,
        chapterId,
      }, matchedRanges);
      if (!aiRequest) return [];

      const aiResult = await this.ai.infer(aiRequest);

      if (aiResult?.entities) {
        return mapAIEntitiesToDecoded(aiResult.entities);
      }
    } catch (e) {
      this.logger.error('AI Fallback failed:', e);
    }
    return [];
  }

  private buildEntity(
    original: string,
    start: number,
    end: number,
    real: string,
    source: 'dictionary' | 'knowledge_graph' | 'ai',
    confidence: number = 90
  ): DecodedEntity {
    return buildEntity(original, start, end, real, source, confidence);
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
