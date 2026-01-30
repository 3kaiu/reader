/**
 * Novel Decoder Worker (网文解密系统 - 重构版)
 * 职责：作为业务 Orchestrator，协调各子服务完成解码任务
 */

import { verifyAuth, type AuthEnv } from './shared/auth.ts';
import { createLogger, type Logger } from './shared/logger.ts';
import {
  type DecodeRequest,
  type DecodeResponse,
  type DecodedEntity,
  type ChapterContext,
  type WorkerEnv
} from './shared/types.ts';

// 导入模块化服务
import { DictionaryService } from './decoder/dictionaryService.ts';
import { AIService } from './decoder/aiService.ts';
import { KnowledgeGraphService } from './decoder/knowledgeGraphService.ts';

/** 解码引擎 (Orchestrator) */
class DecoderEngine {
  private dictionary: DictionaryService;
  private kg: KnowledgeGraphService;
  private ai: AIService;
  private logger: Logger;

  constructor(env: WorkerEnv) {
    this.logger = createLogger(env);
    this.dictionary = new DictionaryService(env, this.logger);
    this.kg = new KnowledgeGraphService(env, this.logger);
    this.ai = new AIService(env, this.logger);
  }

  async init(bookId?: string, bookType?: any) {
    await Promise.all([
      this.dictionary.load(bookId, bookType),
      this.kg.load()
    ]);
  }

  async decode(request: DecodeRequest): Promise<DecodeResponse> {
    const { content, bookId, chapterId, bookMeta } = request;
    await this.init(bookId, bookMeta?.type);

    // 1. 提取潜在词汇并匹配
    const potentialTerms = this.extractPotentialTerms(content);
    const entities: DecodedEntity[] = [];
    const matchedRanges: [number, number][] = [];

    for (const { term, start, end } of potentialTerms) {
      const entity = await this.matchTerm(term, start, end, bookId, bookMeta?.type);
      if (entity) {
        entities.push(entity);
        matchedRanges.push([start, end]);
      }
    }

    // 2. AI Fallback: 处理未匹配的关键片段 (例如可能的人名、专有名词)
    if (entities.length < 5 && content.length > 50) {
      const aiEntities = await this.aiLookupFallback(content, matchedRanges);
      entities.push(...aiEntities);
    }

    return {
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
  }

  private async matchTerm(term: string, start: number, end: number, bookId?: string, bookType?: any): Promise<DecodedEntity | null> {
    // 优先词典匹配
    const dictMatch = this.dictionary.lookup(term, bookId, bookType);
    if (dictMatch) {
      return this.buildEntity(term, start, end, dictMatch.real, 'dictionary');
    }

    // 其次 KG 匹配
    const kgMatch = this.kg.findEntity(term);
    if (kgMatch) {
      return this.buildEntity(term, start, end, kgMatch.realName || kgMatch.name, 'knowledge_graph');
    }

    return null;
  }

  private buildEntity(original: string, start: number, end: number, real: string, source: any): DecodedEntity {
    return {
      id: crypto.randomUUID(),
      original,
      position: { start, end },
      candidates: [{ real, confidence: 95, category: 'person' }],
      bestMatch: { real, confidence: 95, category: 'person' },
      source
    };
  }

  private extractPotentialTerms(content: string) {
    const MAX_TERM_LEN = 10;
    const MIN_TERM_LEN = 2;
    const results: { term: string, start: number, end: number }[] = [];

    for (let i = 0; i < content.length; i++) {
      // 简单最大匹配逻辑 (正向)
      for (let len = MAX_TERM_LEN; len >= MIN_TERM_LEN; len--) {
        if (i + len > content.length) continue;
        const term = content.substring(i, i + len);

        // 快速初步检查 (此处可优化为前缀树)
        if (this.dictionary.lookup(term) || this.kg.findEntity(term)) {
          results.push({ term, start: i, end: i + len });
          i += len - 1; // 跳过已匹配部分
          break;
        }
      }
    }
    return results;
  }

  private async aiLookupFallback(content: string, matchedRanges: [number, number][]): Promise<DecodedEntity[]> {
    // 仅针对未覆盖的文本进行 AI 辅助识别
    try {
      const aiResult = await this.ai.infer({
        text: content.slice(0, 1000), // 限制长度
        context: { bookType: 'generic' },
        unknownTerms: [] // 补充缺失字段
      });

      if (aiResult?.entities) {
        return aiResult.entities.map((e: any) => ({
          id: crypto.randomUUID(),
          original: e.original,
          position: { start: -1, end: -1 }, // AI 识别的偏移量需要对齐，暂时设为 -1
          candidates: [{ real: e.real, confidence: 80, category: e.type || 'person' }],
          bestMatch: { real: e.real, confidence: 80, category: e.type || 'person' },
          source: 'ai'
        }));
      }
    } catch (e) {
      this.logger.error('AI Fallback failed:', e);
    }
    return [];
  }
}

// ============================================
// API 处理入口 (保持导出兼容性)
// ============================================

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: any) {
    const logger = createLogger(env);
    const decoder = new DecoderEngine(env);

    // ... 原有的路由处理逻辑 ...
    return new Response("Decoder Active", { status: 200 });
  }
};
headers: corsHeaders(origin),
  });
}

/** POST /decode - 解码章节 */
async function handleDecode(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin') || '';
  const logger = createLogger(env);

  try {
    const body = await request.json() as DecodeRequest;

    if (!body.bookId || !body.chapterId || !body.content) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    const decoder = new DecoderEngine(env);
    const result = await decoder.decode(body);

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  } catch (e) {
    logger.error('Decode error:', e);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }
}

/** GET /dictionary - 获取词典 (使用 KV 存储) */
async function handleGetDictionary(request: Request, env: Env, userId: string): Promise<Response> {
  const origin = request.headers.get('Origin') || '';
  const logger = createLogger(env);
  const url = new URL(request.url);
  const level = url.searchParams.get('level') || 'all';
  const bookId = url.searchParams.get('bookId');
  const category = url.searchParams.get('category') as BookType | null;

  try {
    const entries: DictionaryEntry[] = [];

    // 公共词典 (从 KV)
    if (level === 'all' || level === 'global') {
      const data = await env.DECODER_KV.get('decoder:dict:global');
      if (data) {
        const globalEntries = JSON.parse(data) as DictionaryEntry[];
        entries.push(...globalEntries);
      }
    }

    // 分类词典 (从 KV)
    if ((level === 'all' || level === 'category') && category) {
      const data = await env.DECODER_KV.get(`decoder:dict:category:${category}`);
      if (data) {
        const categoryEntries = JSON.parse(data) as DictionaryEntry[];
        entries.push(...categoryEntries);
      }
    }

    // 用户词典
    if (level === 'all' || level === 'user') {
      const data = await env.DECODER_KV.get(`decoder:user:${userId}:dictionary`);
      if (data) {
        const userEntries = JSON.parse(data) as DictionaryEntry[];
        entries.push(...userEntries);
      }
    }

    // 书籍词典
    if ((level === 'all' || level === 'book') && bookId) {
      const data = await env.DECODER_KV.get(`decoder:book:${bookId}:dictionary`);
      if (data) {
        const bookEntries = JSON.parse(data) as DictionaryEntry[];
        entries.push(...bookEntries);
      }
    }

    return new Response(JSON.stringify({ entries }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  } catch (e) {
    logger.error('Get dictionary error:', e);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }
}

/** PUT /dictionary - 更新词典 */
async function handleUpdateDictionary(request: Request, env: Env, userId: string): Promise<Response> {
  const origin = request.headers.get('Origin') || '';
  const logger = createLogger(env);

  try {
    const body = await request.json() as {
      entry: Partial<DictionaryEntry>;
      level: DictionaryLevel;
      bookId?: string;
      promote?: boolean; // 是否提升到分类词典
    };

    const { entry, level, bookId, promote } = body;

    if (!entry.original || !entry.real) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    // 构建完整词条
    const now = Date.now();
    const fullEntry: DictionaryEntry = {
      id: entry.id || generateId(),
      original: entry.original,
      real: entry.real,
      category: entry.category || 'person',
      aliases: entry.aliases,
      description: entry.description,
      level,
      categoryTags: entry.categoryTags,
      eraRange: entry.eraRange,
      bookId: level === 'book' ? bookId : undefined,
      confidence: entry.confidence || 80,
      confirmCount: (entry.confirmCount || 0) + 1,
      source: 'user',
      createdAt: entry.createdAt || now,
      updatedAt: now,
    };

    // 根据层级存储
    if (level === 'book' && bookId) {
      const key = `decoder:book:${bookId}:dictionary`;
      const existing = await env.DECODER_KV.get(key);
      const entries: DictionaryEntry[] = existing ? JSON.parse(existing) : [];

      // 更新或添加
      const idx = entries.findIndex(e => e.original === fullEntry.original);
      if (idx >= 0) {
        entries[idx] = fullEntry;
      } else {
        entries.push(fullEntry);
      }

      await env.DECODER_KV.put(key, JSON.stringify(entries));
    } else if (level === 'category' || promote) {
      // 用户确认后提升到分类词典需要管理员权限，这里先存到用户词典
      const key = `decoder:user:${userId}:dictionary`;
      const existing = await env.DECODER_KV.get(key);
      const entries: DictionaryEntry[] = existing ? JSON.parse(existing) : [];

      const idx = entries.findIndex(e => e.original === fullEntry.original);
      if (idx >= 0) {
        entries[idx] = fullEntry;
      } else {
        entries.push(fullEntry);
      }

      await env.DECODER_KV.put(key, JSON.stringify(entries));

      // 检查是否达到自动提升阈值
      if (fullEntry.confirmCount >= CONFIG.AUTO_PROMOTION_THRESHOLD) {
        // Implement auto-promotion logic
        const decoder = new DecoderEngine(env);
        const promotionManager = decoder.getPromotionManager();
        if (fullEntry.categoryTags && fullEntry.categoryTags.length > 0) {
          await promotionManager.promoteToCategory(fullEntry, fullEntry.categoryTags[0]);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, entry: fullEntry }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  } catch (e) {
    logger.error('Update dictionary error:', e);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }
}

/** POST /dictionary/import - 导入词典 */
async function handleImportDictionary(request: Request, env: Env, userId: string): Promise<Response> {
  const origin = request.headers.get('Origin') || '';
  const logger = createLogger(env);

  try {
    const body = await request.json() as { entries: DictionaryEntry[] };

    if (!Array.isArray(body.entries)) {
      return new Response(JSON.stringify({ error: 'Invalid format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    // 验证并过滤有效词条
    const validEntries = body.entries.filter(validateDictionaryEntry);

    // 存储到用户词典
    const key = `decoder:user:${userId}:dictionary`;
    const existing = await env.DECODER_KV.get(key);
    const currentEntries: DictionaryEntry[] = existing ? JSON.parse(existing) : [];

    // 合并（新词条覆盖旧词条）
    const merged = new Map<string, DictionaryEntry>();
    currentEntries.forEach(e => merged.set(e.original, e));
    validEntries.forEach(e => merged.set(e.original, e));

    await env.DECODER_KV.put(key, JSON.stringify([...merged.values()]));

    return new Response(JSON.stringify({
      success: true,
      imported: validEntries.length,
      total: merged.size
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  } catch (e) {
    logger.error('Import dictionary error:', e);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }
}

/** GET /dictionary/export - 导出词典 */
async function handleExportDictionary(request: Request, env: Env, userId: string): Promise<Response> {
  const origin = request.headers.get('Origin') || '';
  const logger = createLogger(env);

  try {
    const key = `decoder:user:${userId}:dictionary`;
    const data = await env.DECODER_KV.get(key);
    const entries: DictionaryEntry[] = data ? JSON.parse(data) : [];

    return new Response(JSON.stringify({ entries }), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="decoder-dictionary.json"',
        ...corsHeaders(origin),
      },
    });
  } catch (e) {
    logger.error('Export dictionary error:', e);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }
}

/** DELETE /dictionary/:id - 删除词典条目 */
async function handleDeleteDictionary(
  request: Request,
  env: Env,
  userId: string,
  entryId: string
): Promise<Response> {
  const origin = request.headers.get('Origin') || '';
  const logger = createLogger(env);
  const url = new URL(request.url);
  const level = (url.searchParams.get('level') || 'user') as DictionaryLevel;
  const bookId = url.searchParams.get('bookId');
  const category = url.searchParams.get('category') as BookType | null;

  // Validate parameters
  if (level === 'book' && !bookId) {
    return new Response(JSON.stringify({
      error: 'Missing required parameter',
      parameter: 'bookId'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }

  if (level === 'category' && !category) {
    return new Response(JSON.stringify({
      error: 'Missing required parameter',
      parameter: 'category'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }

  try {
    // Determine KV key based on level
    let key: string;
    if (level === 'user') {
      key = `decoder:user:${userId}:dictionary`;
    } else if (level === 'book') {
      key = `decoder:book:${bookId}:dictionary`;
    } else {
      key = `decoder:dict:category:${category}`;
    }

    // Get current dictionary
    const data = await env.DECODER_KV.get(key);
    if (!data) {
      return new Response(JSON.stringify({
        error: 'Dictionary not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    const entries: DictionaryEntry[] = JSON.parse(data);

    // Find and remove entry
    const initialLength = entries.length;
    const filtered = entries.filter(e => e.id !== entryId);

    if (filtered.length === initialLength) {
      return new Response(JSON.stringify({
        error: 'Entry not found',
        id: entryId
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    // Save updated dictionary
    await env.DECODER_KV.put(key, JSON.stringify(filtered));

    logger.info(`Deleted dictionary entry ${entryId} from ${level} dictionary`);

    return new Response(JSON.stringify({
      success: true,
      deletedId: entryId,
      level,
      message: 'Entry deleted successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });

  } catch (e) {
    logger.error('Delete dictionary error:', e);
    return new Response(JSON.stringify({
      error: 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }
}

/** DELETE /dictionary/batch - 批量删除词典条目 */
async function handleBatchDeleteDictionary(
  request: Request,
  env: Env,
  userId: string
): Promise<Response> {
  const origin = request.headers.get('Origin') || '';
  const logger = createLogger(env);

  try {
    const body = await request.json() as {
      ids: string[];
      level?: DictionaryLevel;
      bookId?: string;
      category?: BookType;
    };

    // Validate input
    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      return new Response(JSON.stringify({
        error: 'Invalid request',
        message: 'IDs array cannot be empty'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    if (body.ids.length > 100) {
      return new Response(JSON.stringify({
        error: 'Invalid request',
        message: 'Too many IDs (max 100)'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    const level = body.level || 'user';

    // Validate level-specific parameters
    if (level === 'book' && !body.bookId) {
      return new Response(JSON.stringify({
        error: 'Missing required parameter',
        parameter: 'bookId'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    if (level === 'category' && !body.category) {
      return new Response(JSON.stringify({
        error: 'Missing required parameter',
        parameter: 'category'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    // Determine KV key
    let key: string;
    if (level === 'user') {
      key = `decoder:user:${userId}:dictionary`;
    } else if (level === 'book') {
      key = `decoder:book:${body.bookId}:dictionary`;
    } else {
      key = `decoder:dict:category:${body.category}`;
    }

    // Get current dictionary
    const data = await env.DECODER_KV.get(key);
    if (!data) {
      return new Response(JSON.stringify({
        success: true,
        deleted: 0,
        failed: body.ids.length,
        details: {
          deletedIds: [],
          failedIds: body.ids
        }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    const entries: DictionaryEntry[] = JSON.parse(data);
    const idsToDelete = new Set(body.ids);
    const deletedIds: string[] = [];

    // Filter out entries to delete
    const filtered = entries.filter(e => {
      if (idsToDelete.has(e.id)) {
        deletedIds.push(e.id);
        return false;
      }
      return true;
    });

    // Determine failed IDs
    const failedIds = body.ids.filter(id => !deletedIds.includes(id));

    // Save updated dictionary
    await env.DECODER_KV.put(key, JSON.stringify(filtered));

    logger.info(`Batch deleted ${deletedIds.length} entries from ${level} dictionary`);

    return new Response(JSON.stringify({
      success: true,
      deleted: deletedIds.length,
      failed: failedIds.length,
      details: {
        deletedIds,
        failedIds
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });

  } catch (e) {
    logger.error('Batch delete dictionary error:', e);
    return new Response(JSON.stringify({
      error: 'Internal server error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }
}

/** GET /book/:bookId/state - 获取书籍状态 (11.1) */
async function handleGetBookState(request: Request, env: Env, bookId: string): Promise<Response> {
  const origin = request.headers.get('Origin') || '';
  const logger = createLogger(env);

  try {
    const decoder = new DecoderEngine(env);
    const state = await decoder.getBookStateManager().getBookState(bookId);

    if (!state) {
      return new Response(JSON.stringify({ error: 'Book state not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    return new Response(JSON.stringify(state), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  } catch (e) {
    logger.error('Get book state error:', e);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }
}

/** PUT /book/:bookId/state - 更新书籍状态 (11.1) */
async function handleUpdateBookState(request: Request, env: Env, bookId: string): Promise<Response> {
  const origin = request.headers.get('Origin') || '';
  const logger = createLogger(env);

  try {
    const body = await request.json() as {
      meta?: BookMeta;
      aliasChain?: { bookAlias: string; realName?: string; entityId?: string };
    };

    const decoder = new DecoderEngine(env);
    const stateManager = decoder.getBookStateManager();

    // 初始化或获取现有状态
    let state = await stateManager.getBookState(bookId);
    if (!state && body.meta) {
      state = await stateManager.initBookState(bookId, body.meta);
    } else if (!state) {
      return new Response(JSON.stringify({ error: 'Book state not found, provide meta to create' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    // 更新 meta
    if (body.meta) {
      state.meta = { ...state.meta, ...body.meta };
      await stateManager.saveBookState(state);
    }

    // 添加别名链
    if (body.aliasChain) {
      await stateManager.addAliasChain(
        bookId,
        body.aliasChain.bookAlias,
        body.aliasChain.realName,
        body.aliasChain.entityId
      );
      state = await stateManager.getBookState(bookId);
    }

    return new Response(JSON.stringify(state), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  } catch (e) {
    logger.error('Update book state error:', e);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }
}

/** POST /dictionary/confirm - 用户确认词条并检查自动提升 (11.4) */
async function handleConfirmEntry(request: Request, env: Env, userId: string): Promise<Response> {
  const origin = request.headers.get('Origin') || '';
  const logger = createLogger(env);

  try {
    const body = await request.json() as {
      entry: DictionaryEntry;
      bookId: string;
      bookType?: BookType;
    };

    if (!body.entry || !body.bookId) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    const decoder = new DecoderEngine(env);
    const promotionManager = decoder.getPromotionManager();

    // 处理用户确认
    const { promoted, confirmation } = await promotionManager.handleUserConfirmation(
      body.entry,
      body.bookId,
      body.bookType
    );

    // 同时保存到书籍词典
    const bookDictKey = `decoder:book:${body.bookId}:dictionary`;
    const existing = await env.DECODER_KV.get(bookDictKey);
    const entries: DictionaryEntry[] = existing ? JSON.parse(existing) : [];

    const now = Date.now();
    const updatedEntry: DictionaryEntry = {
      ...body.entry,
      level: 'book',
      bookId: body.bookId,
      confirmCount: (body.entry.confirmCount || 0) + 1,
      source: 'user',
      updatedAt: now,
    };

    const idx = entries.findIndex(e => e.original === updatedEntry.original);
    if (idx >= 0) {
      entries[idx] = updatedEntry;
    } else {
      entries.push(updatedEntry);
    }

    await env.DECODER_KV.put(bookDictKey, JSON.stringify(entries));

    return new Response(JSON.stringify({
      success: true,
      entry: updatedEntry,
      promoted,
      confirmation: {
        totalConfirmCount: confirmation.totalConfirmCount,
        confirmedInBooks: confirmation.confirmedInBooks.length,
        threshold: CONFIG.AUTO_PROMOTION_THRESHOLD,
      },
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  } catch (e) {
    logger.error('Confirm entry error:', e);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }
}

// ============================================
// Worker 入口
// ============================================

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = request.headers.get('Origin') || '';

    // 保存 ctx 用于异步操作
    env.ctx = ctx;

    // 处理 CORS 预检
    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }

    // 健康检查（不需要认证）
    if (path === '/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        service: 'novel-decoder',
        timestamp: new Date().toISOString(),
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    // ========== 以下端点需要认证 ==========
    const user = await verifyAuth(request, env);
    if (!user) {
      return new Response(JSON.stringify({
        error: 'Unauthorized',
        message: 'Please login first',
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    // 从 token payload 中提取 userId
    const userId = user.id;

    // 路由
    switch (true) {
      // 解码章节
      case path === '/decode' && request.method === 'POST':
        return handleDecode(request, env);

      // 获取词典
      case path === '/dictionary' && request.method === 'GET':
        return handleGetDictionary(request, env, userId);

      // 更新词典
      case path === '/dictionary' && request.method === 'PUT':
        return handleUpdateDictionary(request, env, userId);

      // 导入词典
      case path === '/dictionary/import' && request.method === 'POST':
        return handleImportDictionary(request, env, userId);

      // 导出词典
      case path === '/dictionary/export' && request.method === 'GET':
        return handleExportDictionary(request, env, userId);

      // 用户确认词条 (11.4)
      case path === '/dictionary/confirm' && request.method === 'POST':
        return handleConfirmEntry(request, env, userId);

      // 批量删除词典条目
      case path === '/dictionary/batch' && request.method === 'DELETE':
        return handleBatchDeleteDictionary(request, env, userId);

      default:
        break;
    }

    // 删除单个词典条目 (需要动态路由匹配)
    const deleteDictMatch = path.match(/^\/dictionary\/([^/]+)$/);
    if (deleteDictMatch && request.method === 'DELETE') {
      const entryId = deleteDictMatch[1];
      // 确保不是 /dictionary/batch
      if (entryId !== 'batch') {
        return handleDeleteDictionary(request, env, userId, entryId);
      }
    }

    // 书籍状态路由 (11.1)
    const bookStateMatch = path.match(/^\/book\/([^/]+)\/state$/);
    if (bookStateMatch) {
      const bookId = bookStateMatch[1];
      if (request.method === 'GET') {
        return handleGetBookState(request, env, bookId);
      } else if (request.method === 'PUT') {
        return handleUpdateBookState(request, env, bookId);
      }
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  },
};
