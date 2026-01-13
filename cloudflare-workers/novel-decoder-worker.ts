/**
 * Novel Decoder Worker (网文解密系统)
 * 
 * 功能：
 * 1. 多层次加密词识别（谐音、代称、暗指等）
 * 2. 三层词典系统（公共 → 分类 → 书籍）
 * 3. 知识图谱查询（人物、公司、事件）
 * 4. AI 推理兜底（CF Workers AI → Groq → HF）
 * 5. 上下文分析与缓存
 */

// ============================================
// 核心类型定义
// ============================================

/** 实体类别 */
export type EntityCategory = 'person' | 'company' | 'place' | 'event' | 'organization';

/** 书籍类型 */
export type BookType = 'era' | 'entertainment' | 'urban' | 'history' | 'business';

/** 识别来源 */
export type DecodeSource = 'dictionary' | 'rule' | 'knowledge_graph' | 'ai';

/** 词典层级 */
export type DictionaryLevel = 'global' | 'category' | 'book';

/** 词条来源 */
export type EntrySource = 'system' | 'user' | 'ai' | 'community';

// ============================================
// 词典系统类型
// ============================================

/** 词典条目 */
export interface DictionaryEntry {
  id: string;
  original: string;           // 加密词: "马芸"
  real: string;               // 真实指代: "马云"
  category: EntityCategory;
  aliases?: string[];         // 其他别名: ["杰克马", "风清扬"]
  description?: string;       // 描述: "阿里巴巴创始人"
  
  // 分层信息
  level: DictionaryLevel;
  categoryTags?: BookType[];  // 适用的书籍类型
  eraRange?: [number, number]; // 适用年代范围 [1990, 2020]
  bookId?: string;            // 书籍专属词条

  // 元数据
  confidence: number;         // 置信度 0-100
  confirmCount: number;       // 被确认次数
  source: EntrySource;
  createdAt: number;
  updatedAt: number;
}

/** 候选结果 */
export interface Candidate {
  real: string;               // 真实指代
  confidence: number;         // 置信度 0-100
  category: EntityCategory;
  reasoning?: string;         // 推理依据
  evidence?: string[];        // 证据列表
}

/** 解码后的实体 */
export interface DecodedEntity {
  id: string;
  original: string;           // 原文: "大领导"
  position: { start: number; end: number };
  candidates: Candidate[];
  bestMatch: Candidate | null;
  source: DecodeSource;
}

// ============================================
// 上下文分析类型
// ============================================

/** 章节上下文 */
export interface ChapterContext {
  timeContext: {
    era?: string;             // "1980年代"
    specificDate?: string;    // "1980年2月"
    confidence: number;
  };
  locationContext: {
    city?: string;            // "北京"
    specificPlace?: string;   // "中南海"
    confidence: number;
  };
  industryContext: string[];  // ["电影", "政治"]
  identifiedEntities: {
    entityId: string;
    mentions: string[];       // 在本章中的称呼
    lastMentionPosition: number;
  }[];
}

// ============================================
// 请求/响应类型
// ============================================

/** 书籍元数据 */
export interface BookMeta {
  type: BookType;
  era?: string;               // "1979-1985"
  tags?: string[];
}

/** 书籍上下文状态 (11.1) */
export interface BookState {
  bookId: string;
  meta: BookMeta;
  // 已识别的人物别名链 (书中"老汪"="汪洋"=真实人物X)
  aliasChains: {
    bookAlias: string;        // 书中称呼: "老汪"
    realName?: string;        // 真实姓名: "汪洋"
    entityId?: string;        // 知识图谱实体ID
  }[];
  // 统计信息
  stats: {
    totalDecoded: number;     // 已解码章节数
    totalEntities: number;    // 已识别实体数
    lastUpdated: number;      // 最后更新时间
  };
  createdAt: number;
  updatedAt: number;
}

/** 词条确认记录 (用于自动提升) */
export interface EntryConfirmation {
  entryId: string;
  original: string;
  real: string;
  category: EntityCategory;
  confirmedInBooks: string[]; // 在哪些书中被确认
  totalConfirmCount: number;
  lastConfirmedAt: number;
}

/** 解码请求 */
export interface DecodeRequest {
  bookId: string;
  chapterId: string;
  content: string;
  bookMeta?: BookMeta;
}

/** 解码响应 */
export interface DecodeResponse {
  chapterId: string;
  entities: DecodedEntity[];
  context: ChapterContext;
  cached: boolean;
}

// ============================================
// 知识图谱类型
// ============================================

/** 人物实体 */
export interface PersonEntity {
  id: string;
  realName: string;
  aliases: string[];
  features: {
    dialect?: string;         // 方言: "四川话"
    habits?: string[];        // 习惯: ["抽烟", "喝茶"]
    appearance?: string[];    // 外貌特征
    quotes?: string[];        // 名言语录
  };
  timeline: {
    position: string;         // 职位
    organization: string;     // 组织
    startDate: string;        // "1977-01"
    endDate?: string;         // "1980-12"
  }[];
  relations: {
    type: 'superior' | 'subordinate' | 'colleague' | 'family' | 'rival';
    targetId: string;
    description?: string;
  }[];
}

/** 公司实体 */
export interface CompanyEntity {
  id: string;
  realName: string;
  aliases: string[];          // ["鹅厂", "TX", "某讯"]
  founders: string[];
  products: string[];
  location: string;
  foundedYear: number;
}

/** 事件实体 */
export interface EventEntity {
  id: string;
  name: string;
  aliases: string[];
  date: string;
  participants: string[];
  description: string;
}

// ============================================
// AI 推理类型
// ============================================

/** AI 推理请求 */
export interface AIInferRequest {
  text: string;
  context: ChapterContext;
  unknownTerms: string[];
  maxCandidates?: number;
}

/** AI 推理响应 */
export interface AIInferResponse {
  results: {
    original: string;
    candidates: {
      real: string;
      confidence: number;
      reasoning: string;
    }[];
  }[];
  tokensUsed: number;
}

// ============================================
// Cloudflare Workers 类型 (简化版)
// ============================================

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

interface Ai {
  run(model: string, inputs: Record<string, unknown>): Promise<unknown>;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// ============================================
// 环境变量类型
// ============================================

export interface Env {
  // KV 存储 - 词典、知识图谱、用户数据和缓存（不需要信用卡）
  DECODER_KV: KVNamespace;
  
  // AI 服务
  AI: Ai;                     // CF Workers AI
  GROQ_API_KEY?: string;
  HF_API_KEY?: string;
  
  // 认证
  AUTH_SECRET: string;
  
  // 上下文
  ctx?: ExecutionContext;
}

// ============================================
// 配置常量
// ============================================

const CONFIG = {
  // 缓存 TTL
  DECODE_CACHE_TTL: 7 * 24 * 60 * 60,  // 解码结果缓存 7 天
  DICTIONARY_CACHE_TTL: 60 * 60,        // 词典缓存 1 小时
  
  // AI 限制
  MAX_AI_CALLS_PER_CHAPTER: 10,
  AI_TIMEOUT_MS: 10000,
  
  // 词条自动提升阈值
  AUTO_PROMOTION_THRESHOLD: 3,
  
  // 置信度阈值
  HIGH_CONFIDENCE_THRESHOLD: 70,
  
  // 允许的源
  ALLOWED_ORIGINS: [
    'https://nexus-reader.pages.dev',
    'http://localhost:5173',
    'http://localhost:4173',
  ],
};

// ============================================
// 工具函数
// ============================================

/** CORS 头 */
function corsHeaders(origin: string): Record<string, string> {
  const allowedOrigin = CONFIG.ALLOWED_ORIGINS.includes(origin) 
    ? origin 
    : CONFIG.ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
}

/** 生成唯一 ID */
function generateId(): string {
  return crypto.randomUUID();
}

// ============================================
// 词典系统实现
// ============================================

/** 验证词典条目 */
export function validateDictionaryEntry(entry: unknown): entry is DictionaryEntry {
  if (!entry || typeof entry !== 'object') return false;
  const e = entry as Record<string, unknown>;
  
  // 必填字段
  if (typeof e.id !== 'string' || e.id.length === 0) return false;
  if (typeof e.original !== 'string' || e.original.length === 0) return false;
  if (typeof e.real !== 'string' || e.real.length === 0) return false;
  if (!['person', 'company', 'place', 'event', 'organization'].includes(e.category as string)) return false;
  if (!['global', 'category', 'book'].includes(e.level as string)) return false;
  if (typeof e.confidence !== 'number' || e.confidence < 0 || e.confidence > 100) return false;
  if (typeof e.confirmCount !== 'number' || e.confirmCount < 0) return false;
  if (!['system', 'user', 'ai', 'community'].includes(e.source as string)) return false;
  if (typeof e.createdAt !== 'number') return false;
  if (typeof e.updatedAt !== 'number') return false;
  
  // 可选字段验证
  if (e.aliases !== undefined && !Array.isArray(e.aliases)) return false;
  if (e.categoryTags !== undefined && !Array.isArray(e.categoryTags)) return false;
  if (e.eraRange !== undefined) {
    if (!Array.isArray(e.eraRange) || e.eraRange.length !== 2) return false;
  }
  
  return true;
}

/** 序列化词典条目 */
export function serializeDictionaryEntry(entry: DictionaryEntry): string {
  return JSON.stringify(entry);
}

/** 反序列化词典条目 */
export function deserializeDictionaryEntry(json: string): DictionaryEntry | null {
  try {
    const parsed = JSON.parse(json);
    if (validateDictionaryEntry(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/** 词典索引 */
class DictionaryIndex {
  private exact: Map<string, DictionaryEntry[]> = new Map();
  private pinyin: Map<string, DictionaryEntry[]> = new Map();
  private initials: Map<string, DictionaryEntry[]> = new Map();
  
  /** 添加条目到索引 */
  addEntry(entry: DictionaryEntry): void {
    // 精确匹配索引
    const exactKey = entry.original.toLowerCase();
    const exactList = this.exact.get(exactKey) || [];
    exactList.push(entry);
    this.exact.set(exactKey, exactList);
    
    // TODO: 拼音索引 (需要 pinyin-pro)
    // TODO: 首字母索引
  }
  
  /** 精确匹配查找 - O(1) */
  findExact(term: string): DictionaryEntry[] {
    return this.exact.get(term.toLowerCase()) || [];
  }
  
  /** 拼音匹配查找 */
  findByPinyin(pinyin: string): DictionaryEntry[] {
    return this.pinyin.get(pinyin.toLowerCase()) || [];
  }
  
  /** 首字母匹配查找 */
  findByInitials(initials: string): DictionaryEntry[] {
    return this.initials.get(initials.toLowerCase()) || [];
  }
}

/** 三层词典管理器 (使用 KV 存储) */
class DictionaryManager {
  private globalDict: DictionaryIndex = new DictionaryIndex();
  private categoryDicts: Map<BookType, DictionaryIndex> = new Map();
  private bookDicts: Map<string, DictionaryIndex> = new Map();
  
  private env: Env;
  private loaded = false;
  
  constructor(env: Env) {
    this.env = env;
  }
  
  /** 加载词典 */
  async load(bookId?: string, bookType?: BookType): Promise<void> {
    if (this.loaded) return;
    
    // 加载公共词典
    await this.loadGlobalDict();
    
    // 加载分类词典
    if (bookType) {
      await this.loadCategoryDict(bookType);
    }
    
    // 加载书籍词典
    if (bookId) {
      await this.loadBookDict(bookId);
    }
    
    this.loaded = true;
  }
  
  private async loadGlobalDict(): Promise<void> {
    try {
      // 使用 KV 存储公共词典
      const data = await this.env.DECODER_KV.get('decoder:dict:global');
      if (data) {
        const entries: DictionaryEntry[] = JSON.parse(data);
        entries.forEach(e => this.globalDict.addEntry(e));
      }
    } catch (e) {
      console.error('Failed to load global dictionary:', e);
    }
  }
  
  private async loadCategoryDict(type: BookType): Promise<void> {
    try {
      // 使用 KV 存储分类词典
      const data = await this.env.DECODER_KV.get(`decoder:dict:category:${type}`);
      if (data) {
        const index = new DictionaryIndex();
        const entries: DictionaryEntry[] = JSON.parse(data);
        entries.forEach(e => index.addEntry(e));
        this.categoryDicts.set(type, index);
      }
    } catch (e) {
      console.error(`Failed to load category dictionary ${type}:`, e);
    }
  }
  
  private async loadBookDict(bookId: string): Promise<void> {
    try {
      const data = await this.env.DECODER_KV.get(`decoder:book:${bookId}:dictionary`);
      if (data) {
        const index = new DictionaryIndex();
        const entries: DictionaryEntry[] = JSON.parse(data);
        entries.forEach(e => index.addEntry(e));
        this.bookDicts.set(bookId, index);
      }
    } catch (e) {
      console.error(`Failed to load book dictionary ${bookId}:`, e);
    }
  }
  
  /** 查找词条 - 按优先级: book > category > global */
  lookup(term: string, bookId?: string, bookType?: BookType): DictionaryEntry | null {
    // 1. 书籍词典优先
    if (bookId) {
      const bookIndex = this.bookDicts.get(bookId);
      if (bookIndex) {
        const results = bookIndex.findExact(term);
        if (results.length > 0) return results[0];
      }
    }
    
    // 2. 分类词典
    if (bookType) {
      const categoryIndex = this.categoryDicts.get(bookType);
      if (categoryIndex) {
        const results = categoryIndex.findExact(term);
        if (results.length > 0) return results[0];
      }
    }
    
    // 3. 公共词典
    const globalResults = this.globalDict.findExact(term);
    if (globalResults.length > 0) return globalResults[0];
    
    return null;
  }
}

// ============================================
// 书籍状态管理 (11.1)
// ============================================

class BookStateManager {
  private env: Env;
  private stateCache: Map<string, BookState> = new Map();
  
  constructor(env: Env) {
    this.env = env;
  }
  
  /** 获取书籍状态 */
  async getBookState(bookId: string): Promise<BookState | null> {
    // 先检查缓存
    if (this.stateCache.has(bookId)) {
      return this.stateCache.get(bookId)!;
    }
    
    try {
      const data = await this.env.DECODER_KV.get(`decoder:book:${bookId}:state`);
      if (data) {
        const state = JSON.parse(data) as BookState;
        this.stateCache.set(bookId, state);
        return state;
      }
    } catch (e) {
      console.error(`Failed to load book state ${bookId}:`, e);
    }
    
    return null;
  }
  
  /** 创建或更新书籍状态 */
  async saveBookState(state: BookState): Promise<void> {
    state.updatedAt = Date.now();
    
    try {
      await this.env.DECODER_KV.put(
        `decoder:book:${state.bookId}:state`,
        JSON.stringify(state)
      );
      this.stateCache.set(state.bookId, state);
    } catch (e) {
      console.error(`Failed to save book state ${state.bookId}:`, e);
    }
  }
  
  /** 初始化书籍状态 */
  async initBookState(bookId: string, meta: BookMeta): Promise<BookState> {
    const existing = await this.getBookState(bookId);
    if (existing) {
      // 更新 meta 如果提供了新的
      existing.meta = { ...existing.meta, ...meta };
      await this.saveBookState(existing);
      return existing;
    }
    
    const now = Date.now();
    const state: BookState = {
      bookId,
      meta,
      aliasChains: [],
      stats: {
        totalDecoded: 0,
        totalEntities: 0,
        lastUpdated: now,
      },
      createdAt: now,
      updatedAt: now,
    };
    
    await this.saveBookState(state);
    return state;
  }
  
  /** 添加别名链 */
  async addAliasChain(
    bookId: string,
    bookAlias: string,
    realName?: string,
    entityId?: string
  ): Promise<void> {
    const state = await this.getBookState(bookId);
    if (!state) return;
    
    // 检查是否已存在
    const existing = state.aliasChains.find(a => a.bookAlias === bookAlias);
    if (existing) {
      existing.realName = realName || existing.realName;
      existing.entityId = entityId || existing.entityId;
    } else {
      state.aliasChains.push({ bookAlias, realName, entityId });
    }
    
    await this.saveBookState(state);
  }
  
  /** 更新统计信息 */
  async updateStats(bookId: string, entitiesCount: number): Promise<void> {
    const state = await this.getBookState(bookId);
    if (!state) return;
    
    state.stats.totalDecoded += 1;
    state.stats.totalEntities += entitiesCount;
    state.stats.lastUpdated = Date.now();
    
    await this.saveBookState(state);
  }
  
  /** 通过书中别名查找真实名称 */
  async resolveAlias(bookId: string, alias: string): Promise<string | null> {
    const state = await this.getBookState(bookId);
    if (!state) return null;
    
    const chain = state.aliasChains.find(a => a.bookAlias === alias);
    return chain?.realName || null;
  }
}

// ============================================
// 词条自动提升管理 (11.4)
// ============================================

class EntryPromotionManager {
  private env: Env;
  
  constructor(env: Env) {
    this.env = env;
  }
  
  /** 记录词条确认 */
  async recordConfirmation(
    entry: DictionaryEntry,
    bookId: string
  ): Promise<EntryConfirmation> {
    const key = `decoder:promotion:${entry.original}`;
    
    let confirmation: EntryConfirmation;
    
    try {
      const existing = await this.env.DECODER_KV.get(key);
      if (existing) {
        confirmation = JSON.parse(existing) as EntryConfirmation;
        
        // 检查是否已在此书中确认过
        if (!confirmation.confirmedInBooks.includes(bookId)) {
          confirmation.confirmedInBooks.push(bookId);
          confirmation.totalConfirmCount += 1;
        }
        confirmation.lastConfirmedAt = Date.now();
      } else {
        confirmation = {
          entryId: entry.id,
          original: entry.original,
          real: entry.real,
          category: entry.category,
          confirmedInBooks: [bookId],
          totalConfirmCount: 1,
          lastConfirmedAt: Date.now(),
        };
      }
      
      await this.env.DECODER_KV.put(key, JSON.stringify(confirmation));
    } catch (e) {
      console.error('Failed to record confirmation:', e);
      // 返回默认值
      confirmation = {
        entryId: entry.id,
        original: entry.original,
        real: entry.real,
        category: entry.category,
        confirmedInBooks: [bookId],
        totalConfirmCount: 1,
        lastConfirmedAt: Date.now(),
      };
    }
    
    return confirmation;
  }
  
  /** 检查是否应该自动提升 */
  shouldPromote(confirmation: EntryConfirmation): boolean {
    // 在不同书籍中被确认的次数达到阈值
    return confirmation.confirmedInBooks.length >= CONFIG.AUTO_PROMOTION_THRESHOLD;
  }
  
  /** 提升词条到分类词典 (使用 KV 存储) */
  async promoteToCategory(
    entry: DictionaryEntry,
    categoryType: BookType
  ): Promise<boolean> {
    try {
      // 读取分类词典 (从 KV)
      const categoryKey = `decoder:dict:category:${categoryType}`;
      const data = await this.env.DECODER_KV.get(categoryKey);
      
      let entries: DictionaryEntry[] = [];
      if (data) {
        entries = JSON.parse(data);
      }
      
      // 检查是否已存在
      const existingIdx = entries.findIndex(e => e.original === entry.original);
      
      const promotedEntry: DictionaryEntry = {
        ...entry,
        id: existingIdx >= 0 ? entries[existingIdx].id : generateId(),
        level: 'category',
        categoryTags: [categoryType],
        source: 'community', // 社区贡献
        updatedAt: Date.now(),
      };
      
      if (existingIdx >= 0) {
        // 更新现有词条，增加确认次数
        entries[existingIdx] = {
          ...entries[existingIdx],
          ...promotedEntry,
          confirmCount: entries[existingIdx].confirmCount + 1,
        };
      } else {
        entries.push(promotedEntry);
      }
      
      // 保存回 KV
      await this.env.DECODER_KV.put(categoryKey, JSON.stringify(entries));
      
      console.log(`Promoted entry "${entry.original}" to category ${categoryType}`);
      return true;
    } catch (e) {
      console.error('Failed to promote entry:', e);
      return false;
    }
  }
  
  /** 处理用户确认并检查是否需要提升 */
  async handleUserConfirmation(
    entry: DictionaryEntry,
    bookId: string,
    bookType?: BookType
  ): Promise<{ promoted: boolean; confirmation: EntryConfirmation }> {
    // 记录确认
    const confirmation = await this.recordConfirmation(entry, bookId);
    
    // 检查是否需要提升
    if (this.shouldPromote(confirmation) && bookType) {
      const promoted = await this.promoteToCategory(entry, bookType);
      return { promoted, confirmation };
    }
    
    return { promoted: false, confirmation };
  }
}

// ============================================
// 知识图谱实现
// ============================================

class KnowledgeGraph {
  private persons: Map<string, PersonEntity> = new Map();
  private companies: Map<string, CompanyEntity> = new Map();
  private events: Map<string, EventEntity> = new Map();
  
  private env: Env;
  private loaded = false;
  
  constructor(env: Env) {
    this.env = env;
  }
  
  /** 加载知识图谱 (使用 KV 存储) */
  async load(): Promise<void> {
    if (this.loaded) return;
    
    try {
      // 加载人物
      const personsData = await this.env.DECODER_KV.get('decoder:knowledge:persons');
      if (personsData) {
        const data: PersonEntity[] = JSON.parse(personsData);
        data.forEach(p => this.persons.set(p.id, p));
      }
      
      // 加载公司
      const companiesData = await this.env.DECODER_KV.get('decoder:knowledge:companies');
      if (companiesData) {
        const data: CompanyEntity[] = JSON.parse(companiesData);
        data.forEach(c => this.companies.set(c.id, c));
      }
      
      // 加载事件
      const eventsData = await this.env.DECODER_KV.get('decoder:knowledge:events');
      if (eventsData) {
        const data: EventEntity[] = JSON.parse(eventsData);
        data.forEach(e => this.events.set(e.id, e));
      }
      
      this.loaded = true;
    } catch (e) {
      console.error('Failed to load knowledge graph:', e);
    }
  }
  
  /** 按时间点查询人物职位 */
  queryPersonPosition(personId: string, date: string): string | null {
    const person = this.persons.get(personId);
    if (!person) return null;
    
    const targetDate = new Date(date);
    
    for (const t of person.timeline) {
      const start = new Date(t.startDate);
      const end = t.endDate ? new Date(t.endDate) : new Date();
      
      if (targetDate >= start && targetDate <= end) {
        return `${t.organization} ${t.position}`;
      }
    }
    
    return null;
  }
  
  /** 通过别名查找人物 */
  findPersonByAlias(alias: string): PersonEntity | null {
    for (const person of this.persons.values()) {
      if (person.realName === alias || person.aliases.includes(alias)) {
        return person;
      }
    }
    return null;
  }
  
  /** 通过别名查找公司 */
  findCompanyByAlias(alias: string): CompanyEntity | null {
    for (const company of this.companies.values()) {
      if (company.realName === alias || company.aliases.includes(alias)) {
        return company;
      }
    }
    return null;
  }
}

// ============================================
// 上下文分析器实现
// ============================================

class ContextAnalyzer {
  /** 提取时间背景 */
  extractTimeContext(content: string): ChapterContext['timeContext'] {
    // 匹配年份
    const yearMatch = content.match(/(\d{4})年/);
    // 匹配年代
    const eraMatch = content.match(/([\d零一二三四五六七八九]+)年代/);
    // 匹配具体日期
    const dateMatch = content.match(/(\d{4})年(\d{1,2})月/);
    
    let era: string | undefined;
    let specificDate: string | undefined;
    let confidence = 0;
    
    if (dateMatch) {
      specificDate = `${dateMatch[1]}年${dateMatch[2]}月`;
      era = `${Math.floor(parseInt(dateMatch[1]) / 10) * 10}年代`;
      confidence = 90;
    } else if (yearMatch) {
      era = `${Math.floor(parseInt(yearMatch[1]) / 10) * 10}年代`;
      confidence = 70;
    } else if (eraMatch) {
      era = `${eraMatch[1]}年代`;
      confidence = 60;
    }
    
    return { era, specificDate, confidence };
  }
  
  /** 提取地点背景 */
  extractLocationContext(content: string): ChapterContext['locationContext'] {
    // 常见地点关键词
    const placeKeywords: Record<string, { city: string; place?: string }> = {
      '海子里': { city: '北京', place: '中南海' },
      '中南海': { city: '北京', place: '中南海' },
      '紫光阁': { city: '北京', place: '中南海紫光阁' },
      '人民大会堂': { city: '北京', place: '人民大会堂' },
      '长安街': { city: '北京', place: '长安街' },
      '外滩': { city: '上海', place: '外滩' },
      '陆家嘴': { city: '上海', place: '陆家嘴' },
    };
    
    for (const [keyword, location] of Object.entries(placeKeywords)) {
      if (content.includes(keyword)) {
        return {
          city: location.city,
          specificPlace: location.place,
          confidence: 85,
        };
      }
    }
    
    // 匹配城市名
    const cityMatch = content.match(/(北京|上海|广州|深圳|杭州|成都|重庆|武汉|西安|南京)/);
    if (cityMatch) {
      return { city: cityMatch[1], confidence: 60 };
    }
    
    return { confidence: 0 };
  }
  
  /** 提取行业背景 */
  extractIndustryContext(content: string): string[] {
    const industries: string[] = [];
    
    const industryKeywords: Record<string, string[]> = {
      '电影': ['电影', '导演', '演员', '拍摄', '剧本', '票房'],
      '政治': ['领导', '部长', '书记', '政府', '中央', '会议'],
      '互联网': ['互联网', '网站', '程序', '代码', 'APP', '融资'],
      '娱乐': ['明星', '歌手', '综艺', '演唱会', '粉丝'],
      '商业': ['公司', '企业', '投资', '股票', '上市'],
    };
    
    for (const [industry, keywords] of Object.entries(industryKeywords)) {
      if (keywords.some(k => content.includes(k))) {
        industries.push(industry);
      }
    }
    
    return industries;
  }
  
  /** 分析章节上下文 */
  analyze(content: string): ChapterContext {
    return {
      timeContext: this.extractTimeContext(content),
      locationContext: this.extractLocationContext(content),
      industryContext: this.extractIndustryContext(content),
      identifiedEntities: [],
    };
  }
}

// ============================================
// AI 推理引擎实现
// ============================================

class AIInferenceEngine {
  private env: Env;
  private callCount = 0;
  
  constructor(env: Env) {
    this.env = env;
  }
  
  /** 重置调用计数 */
  resetCallCount(): void {
    this.callCount = 0;
  }
  
  /** 检查是否可以调用 AI */
  canCall(): boolean {
    return this.callCount < CONFIG.MAX_AI_CALLS_PER_CHAPTER;
  }
  
  /** 构建推理 Prompt */
  private buildPrompt(request: AIInferRequest): string {
    const contextInfo: string[] = [];
    
    if (request.context.timeContext.era) {
      contextInfo.push(`时代背景: ${request.context.timeContext.era}`);
    }
    if (request.context.timeContext.specificDate) {
      contextInfo.push(`具体时间: ${request.context.timeContext.specificDate}`);
    }
    if (request.context.locationContext.city) {
      contextInfo.push(`地点: ${request.context.locationContext.city}`);
    }
    if (request.context.industryContext.length > 0) {
      contextInfo.push(`行业: ${request.context.industryContext.join(', ')}`);
    }
    
    return `你是一个网文解密专家，擅长识别中国网络小说中为规避审核而使用的谐音、代称、暗指等"加密"内容。

背景信息:
${contextInfo.join('\n')}

原文片段:
${request.text}

需要识别的词汇: ${request.unknownTerms.join(', ')}

请分析这些词汇可能指代的真实人物、公司、地点或事件。对于每个词汇，给出:
1. 最可能的真实指代
2. 置信度 (0-100)
3. 推理依据

以 JSON 格式返回:
{
  "results": [
    {
      "original": "词汇",
      "candidates": [
        { "real": "真实指代", "confidence": 85, "reasoning": "推理依据" }
      ]
    }
  ]
}`;
  }
  
  /** 调用 CF Workers AI */
  private async callWorkersAI(prompt: string): Promise<AIInferResponse | null> {
    if (!this.env.AI) return null;
    
    try {
      const response = await this.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        prompt,
        max_tokens: 1024,
      });
      
      // 解析响应
      const text = typeof response === 'string' ? response : (response as { response?: string }).response || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as AIInferResponse;
      }
    } catch (e) {
      console.error('Workers AI error:', e);
    }
    
    return null;
  }
  
  /** 调用 Groq API */
  private async callGroq(prompt: string): Promise<AIInferResponse | null> {
    if (!this.env.GROQ_API_KEY) return null;
    
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1024,
        }),
      });
      
      if (!response.ok) return null;
      
      const data = await response.json() as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as AIInferResponse;
      }
    } catch (e) {
      console.error('Groq API error:', e);
    }
    
    return null;
  }

  /** 调用 HuggingFace Inference API */
  private async callHuggingFace(prompt: string): Promise<AIInferResponse | null> {
    if (!this.env.HF_API_KEY) return null;
    
    try {
      const response = await fetch('https://api-inference.huggingface.co/models/meta-llama/Llama-3.1-8B-Instruct', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.env.HF_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: { max_new_tokens: 1024 },
        }),
      });
      
      if (!response.ok) return null;
      
      const data = await response.json() as { generated_text?: string }[];
      const text = data[0]?.generated_text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as AIInferResponse;
      }
    } catch (e) {
      console.error('HuggingFace API error:', e);
    }
    
    return null;
  }
  
  /** 推理 - 按优先级尝试: CF Workers AI → Groq → HF */
  async infer(request: AIInferRequest): Promise<AIInferResponse | null> {
    if (!this.canCall()) {
      console.warn('AI call limit reached');
      return null;
    }
    
    this.callCount++;
    const prompt = this.buildPrompt(request);
    
    // 1. 尝试 CF Workers AI
    let result = await this.callWorkersAI(prompt);
    if (result) return result;
    
    // 2. 尝试 Groq
    result = await this.callGroq(prompt);
    if (result) return result;
    
    // 3. 尝试 HuggingFace
    result = await this.callHuggingFace(prompt);
    if (result) return result;
    
    return null;
  }
}

// ============================================
// 规则引擎实现
// ============================================

class RuleEngine {
  /** 拆字规则映射 */
  private static SPLIT_CHAR_MAP: Record<string, string> = {
    '木子': '李',
    '弓长': '张',
    '古月': '胡',
    '言午': '许',
    '金一': '钊',
    '立早': '章',
    '耳东': '陈',
    '双木': '林',
    '三水': '淼',
  };
  
  /** 常见模式 */
  private static PATTERNS: { pattern: RegExp; handler: (match: string) => Candidate | null }[] = [
    // "某X" 模式
    {
      pattern: /某(\w)/,
      handler: (match) => ({
        real: `姓${match[1]}的某人`,
        confidence: 30,
        category: 'person' as EntityCategory,
        reasoning: '某X 通常指代姓X的某人',
      }),
    },
    // "X厂" 模式
    {
      pattern: /(\w)厂/,
      handler: (match) => {
        const companyMap: Record<string, string> = {
          '鹅': '腾讯',
          '猪': '网易',
          '狗': '京东',
          '猫': '天猫/阿里',
        };
        const real = companyMap[match[1]];
        if (real) {
          return {
            real,
            confidence: 80,
            category: 'company' as EntityCategory,
            reasoning: `${match[1]}厂 是 ${real} 的常见代称`,
          };
        }
        return null;
      },
    },
  ];
  
  /** 应用拆字规则 */
  applySplitCharRule(term: string): Candidate | null {
    const result = RuleEngine.SPLIT_CHAR_MAP[term];
    if (result) {
      return {
        real: result,
        confidence: 90,
        category: 'person',
        reasoning: `拆字规则: "${term}" → "${result}"`,
      };
    }
    return null;
  }
  
  /** 应用模式匹配 */
  applyPatterns(term: string): Candidate | null {
    for (const { pattern, handler } of RuleEngine.PATTERNS) {
      const match = term.match(pattern);
      if (match) {
        return handler(match[0]);
      }
    }
    return null;
  }
  
  /** 尝试所有规则 */
  tryMatch(term: string): Candidate | null {
    // 1. 拆字规则
    let result = this.applySplitCharRule(term);
    if (result) return result;
    
    // 2. 模式匹配
    result = this.applyPatterns(term);
    if (result) return result;
    
    return null;
  }
}

// ============================================
// 核心解码引擎
// ============================================

class DecoderEngine {
  private dictionary: DictionaryManager;
  private knowledgeGraph: KnowledgeGraph;
  private contextAnalyzer: ContextAnalyzer;
  private ruleEngine: RuleEngine;
  private aiEngine: AIInferenceEngine;
  private bookStateManager: BookStateManager;
  private promotionManager: EntryPromotionManager;
  private env: Env;
  
  constructor(env: Env) {
    this.env = env;
    this.dictionary = new DictionaryManager(env);
    this.knowledgeGraph = new KnowledgeGraph(env);
    this.contextAnalyzer = new ContextAnalyzer();
    this.ruleEngine = new RuleEngine();
    this.aiEngine = new AIInferenceEngine(env);
    this.bookStateManager = new BookStateManager(env);
    this.promotionManager = new EntryPromotionManager(env);
  }
  
  /** 初始化 */
  async init(bookId?: string, bookType?: BookType, bookMeta?: BookMeta): Promise<void> {
    await Promise.all([
      this.dictionary.load(bookId, bookType),
      this.knowledgeGraph.load(),
    ]);
    
    // 初始化书籍状态
    if (bookId && bookMeta) {
      await this.bookStateManager.initBookState(bookId, bookMeta);
    }
  }
  
  /** 获取书籍状态管理器 */
  getBookStateManager(): BookStateManager {
    return this.bookStateManager;
  }
  
  /** 获取词条提升管理器 */
  getPromotionManager(): EntryPromotionManager {
    return this.promotionManager;
  }
  
  /** 提取潜在加密词 */
  private extractPotentialTerms(content: string): { term: string; start: number; end: number }[] {
    const terms: { term: string; start: number; end: number }[] = [];
    
    // 常见加密词模式
    const patterns = [
      // 职务暗指: X领导、X公、X哥
      /[大小老]领导|[大小]佬|[A-Z]公|[A-Z]哥/g,
      // 地点暗指: X子里、X海
      /海子里|[东西南北]海|[A-Z]子里/g,
      // 人名谐音: 2-4字中文名
      /[\u4e00-\u9fa5]{2,4}(?=说|道|笑|问|答|叹)/g,
      // 公司代称: X厂、某X
      /[鹅猪狗猫]厂|某[\u4e00-\u9fa5]/g,
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        terms.push({
          term: match[0],
          start: match.index,
          end: match.index + match[0].length,
        });
      }
    }
    
    // 去重
    const seen = new Set<string>();
    return terms.filter(t => {
      const key = `${t.term}:${t.start}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  
  /** 解码单个词 */
  private async decodeTerm(
    term: string,
    position: { start: number; end: number },
    context: ChapterContext,
    bookId?: string,
    bookType?: BookType
  ): Promise<DecodedEntity | null> {
    const entity: DecodedEntity = {
      id: generateId(),
      original: term,
      position,
      candidates: [],
      bestMatch: null,
      source: 'dictionary',
    };
    
    // 1. 词典匹配
    const dictEntry = this.dictionary.lookup(term, bookId, bookType);
    if (dictEntry) {
      entity.candidates.push({
        real: dictEntry.real,
        confidence: dictEntry.confidence,
        category: dictEntry.category,
        reasoning: `词典匹配: ${dictEntry.description || ''}`,
      });
      entity.bestMatch = entity.candidates[0];
      entity.source = 'dictionary';
      return entity;
    }
    
    // 2. 规则引擎
    const ruleResult = this.ruleEngine.tryMatch(term);
    if (ruleResult) {
      entity.candidates.push(ruleResult);
      entity.bestMatch = ruleResult;
      entity.source = 'rule';
      return entity;
    }
    
    // 3. 知识图谱
    const person = this.knowledgeGraph.findPersonByAlias(term);
    if (person) {
      entity.candidates.push({
        real: person.realName,
        confidence: 85,
        category: 'person',
        reasoning: `知识图谱匹配: ${person.aliases.join(', ')}`,
      });
      entity.bestMatch = entity.candidates[0];
      entity.source = 'knowledge_graph';
      return entity;
    }
    
    const company = this.knowledgeGraph.findCompanyByAlias(term);
    if (company) {
      entity.candidates.push({
        real: company.realName,
        confidence: 85,
        category: 'company',
        reasoning: `知识图谱匹配: ${company.aliases.join(', ')}`,
      });
      entity.bestMatch = entity.candidates[0];
      entity.source = 'knowledge_graph';
      return entity;
    }
    
    return entity; // 返回未识别的实体，后续可能用 AI 处理
  }

  /** 解码章节 */
  async decode(request: DecodeRequest): Promise<DecodeResponse> {
    const { bookId, chapterId, content, bookMeta } = request;
    
    // 检查缓存
    const cacheKey = `decoder:cache:${chapterId}`;
    try {
      const cached = await this.env.DECODER_KV.get(cacheKey);
      if (cached) {
        const result = JSON.parse(cached) as DecodeResponse;
        result.cached = true;
        return result;
      }
    } catch (e) {
      console.error('Cache read error:', e);
    }
    
    // 初始化（包含书籍状态）
    await this.init(bookId, bookMeta?.type, bookMeta);
    this.aiEngine.resetCallCount();
    
    // 分析上下文
    const context = this.contextAnalyzer.analyze(content);
    
    // 提取潜在加密词
    const potentialTerms = this.extractPotentialTerms(content);
    
    // 解码每个词
    const entities: DecodedEntity[] = [];
    const unknownTerms: string[] = [];
    
    for (const { term, start, end } of potentialTerms) {
      const entity = await this.decodeTerm(term, { start, end }, context, bookId, bookMeta?.type);
      if (entity) {
        if (entity.bestMatch) {
          entities.push(entity);
          // 更新上下文中的已识别实体
          context.identifiedEntities.push({
            entityId: entity.id,
            mentions: [term],
            lastMentionPosition: end,
          });
        } else {
          unknownTerms.push(term);
        }
      }
    }
    
    // AI 推理未识别的词
    if (unknownTerms.length > 0 && this.aiEngine.canCall()) {
      const aiResult = await this.aiEngine.infer({
        text: content.substring(0, 2000), // 限制长度
        context,
        unknownTerms,
        maxCandidates: 3,
      });
      
      if (aiResult?.results) {
        for (const result of aiResult.results) {
          const termInfo = potentialTerms.find(t => t.term === result.original);
          if (termInfo && result.candidates.length > 0) {
            const entity: DecodedEntity = {
              id: generateId(),
              original: result.original,
              position: { start: termInfo.start, end: termInfo.end },
              candidates: result.candidates.map(c => ({
                real: c.real,
                confidence: c.confidence,
                category: 'person' as EntityCategory, // AI 结果默认为 person
                reasoning: c.reasoning,
              })),
              bestMatch: null,
              source: 'ai',
            };
            entity.bestMatch = entity.candidates[0];
            entities.push(entity);
          }
        }
      }
    }
    
    // 按位置排序
    entities.sort((a, b) => a.position.start - b.position.start);
    
    const response: DecodeResponse = {
      chapterId,
      entities,
      context,
      cached: false,
    };
    
    // 缓存结果
    try {
      await this.env.DECODER_KV.put(cacheKey, JSON.stringify(response), {
        expirationTtl: CONFIG.DECODE_CACHE_TTL,
      });
    } catch (e) {
      console.error('Cache write error:', e);
    }
    
    // 更新书籍统计信息 (11.1)
    if (bookId && entities.length > 0) {
      try {
        await this.bookStateManager.updateStats(bookId, entities.length);
      } catch (e) {
        console.error('Update book stats error:', e);
      }
    }
    
    return response;
  }
}

// ============================================
// API 处理函数
// ============================================

/** 验证认证 Token */
async function verifyAuth(request: Request, env: Env): Promise<{ userId: string } | null> {
  const cookie = request.headers.get('Cookie') || '';
  const tokenMatch = cookie.match(/nexus_auth=([^;]+)/);
  const token = tokenMatch ? tokenMatch[1] : request.headers.get('Authorization')?.replace('Bearer ', '');
  
  if (!token) return null;
  
  try {
    const [data, sig] = token.split('.');
    if (!data || !sig) return null;
    
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(env.AUTH_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const expectedSig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
    const expectedSigB64 = btoa(String.fromCharCode(...new Uint8Array(expectedSig)));
    
    if (sig !== expectedSigB64) return null;
    
    const payload = JSON.parse(atob(data)) as { exp: number; userId: string };
    if (payload.exp < Date.now()) return null;
    
    return { userId: payload.userId };
  } catch {
    return null;
  }
}

/** 处理 OPTIONS 预检请求 */
function handleOptions(request: Request): Response {
  const origin = request.headers.get('Origin') || '';
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin),
  });
}

/** POST /decode - 解码章节 */
async function handleDecode(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin') || '';
  
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
    console.error('Decode error:', e);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }
}

/** GET /dictionary - 获取词典 (使用 KV 存储) */
async function handleGetDictionary(request: Request, env: Env, userId: string): Promise<Response> {
  const origin = request.headers.get('Origin') || '';
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
    console.error('Get dictionary error:', e);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }
}

/** PUT /dictionary - 更新词典 */
async function handleUpdateDictionary(request: Request, env: Env, userId: string): Promise<Response> {
  const origin = request.headers.get('Origin') || '';
  
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
        // TODO: 自动提升到分类词典
        console.log(`Entry "${fullEntry.original}" reached promotion threshold`);
      }
    }
    
    return new Response(JSON.stringify({ success: true, entry: fullEntry }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  } catch (e) {
    console.error('Update dictionary error:', e);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }
}

/** POST /dictionary/import - 导入词典 */
async function handleImportDictionary(request: Request, env: Env, userId: string): Promise<Response> {
  const origin = request.headers.get('Origin') || '';
  
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
    console.error('Import dictionary error:', e);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }
}

/** GET /dictionary/export - 导出词典 */
async function handleExportDictionary(request: Request, env: Env, userId: string): Promise<Response> {
  const origin = request.headers.get('Origin') || '';
  
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
    console.error('Export dictionary error:', e);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }
}

/** GET /book/:bookId/state - 获取书籍状态 (11.1) */
async function handleGetBookState(request: Request, env: Env, bookId: string): Promise<Response> {
  const origin = request.headers.get('Origin') || '';
  
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
    console.error('Get book state error:', e);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }
}

/** PUT /book/:bookId/state - 更新书籍状态 (11.1) */
async function handleUpdateBookState(request: Request, env: Env, bookId: string): Promise<Response> {
  const origin = request.headers.get('Origin') || '';
  
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
    console.error('Update book state error:', e);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  }
}

/** POST /dictionary/confirm - 用户确认词条并检查自动提升 (11.4) */
async function handleConfirmEntry(request: Request, env: Env, userId: string): Promise<Response> {
  const origin = request.headers.get('Origin') || '';
  
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
    console.error('Confirm entry error:', e);
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
    
    // 路由
    switch (true) {
      // 解码章节
      case path === '/decode' && request.method === 'POST':
        return handleDecode(request, env);
      
      // 获取词典
      case path === '/dictionary' && request.method === 'GET':
        return handleGetDictionary(request, env, user.userId);
      
      // 更新词典
      case path === '/dictionary' && request.method === 'PUT':
        return handleUpdateDictionary(request, env, user.userId);
      
      // 导入词典
      case path === '/dictionary/import' && request.method === 'POST':
        return handleImportDictionary(request, env, user.userId);
      
      // 导出词典
      case path === '/dictionary/export' && request.method === 'GET':
        return handleExportDictionary(request, env, user.userId);
      
      // 用户确认词条 (11.4)
      case path === '/dictionary/confirm' && request.method === 'POST':
        return handleConfirmEntry(request, env, user.userId);
      
      default:
        break;
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
