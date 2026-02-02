/**
 * Dictionary Service (词典服务)
 * 职责：管理多级词典查找、加载及自动提升逻辑
 * 优化版本：Trie树索引 + 智能缓存 + 并发加载
 */

import {
  type DictionaryEntry,
  type DictionaryLevel,
  type BookType,
  type EntryConfirmation,
  type WorkerEnv
} from '../shared/types.ts';
import { type Logger } from '../shared/logger.ts';

/** Trie树节点 */
class TrieNode {
  children: Map<string, TrieNode> = new Map();
  entries: DictionaryEntry[] = [];
  isEndOfWord = false;

  addEntry(entry: DictionaryEntry): void {
    this.entries.push(entry);
    this.isEndOfWord = true;
  }

  findExact(): DictionaryEntry[] {
    return this.isEndOfWord ? this.entries : [];
  }
}

/** 优化版词典索引 */
class OptimizedDictionaryIndex {
  private trie: TrieNode = new TrieNode();
  private fuzzyCache = new Map<string, DictionaryEntry[]>();
  private accessStats = new Map<string, number>();

  addEntry(entry: DictionaryEntry): void {
    const normalized = entry.original.toLowerCase();
    let node = this.trie;

    for (const char of normalized) {
      if (!node.children.has(char)) {
        node.children.set(char, new TrieNode());
      }
      node = node.children.get(char)!;
    }
    node.addEntry(entry);
  }

  findExact(term: string): DictionaryEntry[] {
    const normalized = term.toLowerCase();
    this.accessStats.set(normalized, (this.accessStats.get(normalized) || 0) + 1);

    let node = this.trie;
    for (const char of normalized) {
      if (!node.children.has(char)) {
        return [];
      }
      node = node.children.get(char)!;
    }
    return node.findExact();
  }

  // 模糊匹配优化
  findFuzzy(term: string, maxDistance = 1): DictionaryEntry[] {
    const cacheKey = `${term}:${maxDistance}`;
    if (this.fuzzyCache.has(cacheKey)) {
      return this.fuzzyCache.get(cacheKey)!;
    }

    const results: DictionaryEntry[] = [];
    this.dfsFuzzy(this.trie, '', term.toLowerCase(), 0, maxDistance, results);

    // 缓存结果，但限制缓存大小
    if (this.fuzzyCache.size > 1000) {
      const firstKey = this.fuzzyCache.keys().next().value;
      this.fuzzyCache.delete(firstKey);
    }
    this.fuzzyCache.set(cacheKey, results);

    return results;
  }

  private dfsFuzzy(node: TrieNode, current: string, target: string, index: number, maxDistance: number, results: DictionaryEntry[]): void {
    if (index > target.length + maxDistance) return;

    if (node.isEndOfWord && Math.abs(current.length - target.length) <= maxDistance) {
      results.push(...node.entries);
    }

    for (const [char, childNode] of node.children) {
      const cost = index < target.length && char !== target[index] ? 1 : 0;
      if (cost <= maxDistance) {
        this.dfsFuzzy(childNode, current + char, target, index + (cost === 0 ? 1 : index), maxDistance - cost, results);
      }
    }
  }

  getHotTerms(limit = 10): string[] {
    return Array.from(this.accessStats.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([term]) => term);
  }

  getStats(): { totalEntries: number; cacheSize: number; hotTermsCount: number } {
    const countEntries = (node: TrieNode): number => {
      let count = node.entries.length;
      for (const child of node.children.values()) {
        count += countEntries(child);
      }
      return count;
    };

    return {
      totalEntries: countEntries(this.trie),
      cacheSize: this.fuzzyCache.size,
      hotTermsCount: this.accessStats.size
    };
  }
}

export class DictionaryService {
  private globalDict: OptimizedDictionaryIndex = new OptimizedDictionaryIndex();
  private categoryDicts: Map<BookType, OptimizedDictionaryIndex> = new Map();
  private bookDicts: Map<string, OptimizedDictionaryIndex> = new Map();

  private env: WorkerEnv;
  private logger: Logger;
  private loaded = false;
  private loadPromise: Promise<void> | null = null;

  private static readonly MAX_GLOBAL_ENTRIES = 5000;
  private static readonly MAX_CATEGORY_ENTRIES = 2000;
  private static readonly MAX_BOOK_ENTRIES = 500;

  constructor(env: WorkerEnv, logger: Logger) {
    this.env = env;
    this.logger = logger;
  }

  async load(bookId?: string, bookType?: BookType): Promise<void> {
    // 避免重复加载
    if (this.loaded) return;

    // 如果正在加载，等待完成
    if (this.loadPromise) {
      return this.loadPromise;
    }

    // 并发加载所有需要的词典
    this.loadPromise = this.performConcurrentLoad(bookId, bookType);
    await this.loadPromise;
    this.loaded = true;
  }

  private async performConcurrentLoad(bookId?: string, bookType?: BookType): Promise<void> {
    const loadTasks: Promise<void>[] = [this.loadGlobalDict()];

    if (bookType) {
      loadTasks.push(this.loadCategoryDict(bookType));
    }

    if (bookId) {
      loadTasks.push(this.loadBookDict(bookId));
    }

    try {
      await Promise.all(loadTasks);
      this.logger.info(`Dictionary loaded: global + ${bookType ? 'category ' : ''}${bookId ? '+ book' : ''}`);
    } catch (error) {
      this.logger.error('Dictionary loading error:', error);
      // 部分失败不影响整体功能
    }
  }

  private async loadGlobalDict(): Promise<void> {
    try {
      const mainData = await this.env.DECODER_KV?.get('decoder:dict:global');
      if (mainData) {
        const entries: DictionaryEntry[] = JSON.parse(mainData);
        const sortedEntries = entries
          .sort((a, b) => (b.confirmCount || 0) - (a.confirmCount || 0)) // 按确认次数排序
          .slice(0, DictionaryService.MAX_GLOBAL_ENTRIES);

        for (const entry of sortedEntries) {
          this.globalDict.addEntry(entry);
        }
      }
    } catch (e) {
      this.logger.error('Failed to load global dictionary:', e);
    }
  }

  private async loadCategoryDict(type: BookType): Promise<void> {
    try {
      const data = await this.env.DECODER_KV?.get(`decoder:dict:category:${type}`);
      if (data) {
        const index = new OptimizedDictionaryIndex();
        const entries: DictionaryEntry[] = JSON.parse(data);
        const sortedEntries = entries
          .sort((a, b) => (b.confirmCount || 0) - (a.confirmCount || 0))
          .slice(0, DictionaryService.MAX_CATEGORY_ENTRIES);

        for (const entry of sortedEntries) {
          index.addEntry(entry);
        }
        this.categoryDicts.set(type, index);
      }
    } catch (e) {
      this.logger.error(`Failed to load category dictionary ${type}:`, e);
    }
  }

  private async loadBookDict(bookId: string): Promise<void> {
    try {
      const data = await this.env.DECODER_KV?.get(`decoder:book:${bookId}:dictionary`);
      if (data) {
        const index = new OptimizedDictionaryIndex();
        const entries: DictionaryEntry[] = JSON.parse(data);
        const sortedEntries = entries
          .sort((a, b) => (b.confirmCount || 0) - (a.confirmCount || 0))
          .slice(0, DictionaryService.MAX_BOOK_ENTRIES);

        for (const entry of sortedEntries) {
          index.addEntry(entry);
        }
        this.bookDicts.set(bookId, index);
      }
    } catch (e) {
      this.logger.error(`Failed to load book dictionary ${bookId}:`, e);
    }
  }

  lookup(term: string, bookId?: string, bookType?: BookType, fuzzy = false): DictionaryEntry | null {
    // 优先精确匹配
    let results = this.findExact(term, bookId, bookType);
    if (results.length > 0) {
      return results[0]; // 返回最相关的结果
    }

    // 如果允许模糊匹配
    if (fuzzy) {
      results = this.findFuzzy(term, bookId, bookType);
      if (results.length > 0) {
        return results[0];
      }
    }

    return null;
  }

  private findExact(term: string, bookId?: string, bookType?: BookType): DictionaryEntry[] {
    // 书籍级别
    if (bookId) {
      const bookIndex = this.bookDicts.get(bookId);
      const results = bookIndex?.findExact(term);
      if (results?.length) return results;
    }

    // 分类级别
    if (bookType) {
      const categoryIndex = this.categoryDicts.get(bookType);
      const results = categoryIndex?.findExact(term);
      if (results?.length) return results;
    }

    // 全局级别
    const globalResults = this.globalDict.findExact(term);
    return globalResults;
  }

  private findFuzzy(term: string, bookId?: string, bookType?: BookType): DictionaryEntry[] {
    const allResults: DictionaryEntry[] = [];

    // 书籍级别模糊匹配
    if (bookId) {
      const bookIndex = this.bookDicts.get(bookId);
      const results = bookIndex?.findFuzzy(term);
      if (results?.length) allResults.push(...results);
    }

    // 分类级别模糊匹配
    if (bookType) {
      const categoryIndex = this.categoryDicts.get(bookType);
      const results = categoryIndex?.findFuzzy(term);
      if (results?.length) allResults.push(...results);
    }

    // 全局级别模糊匹配
    const globalResults = this.globalDict.findFuzzy(term);
    allResults.push(...globalResults);

    // 去重并按置信度排序
    const uniqueResults = allResults.filter((entry, index, arr) =>
      arr.findIndex(e => e.id === entry.id) === index
    );

    return uniqueResults.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  }

  async lookupAsync(term: string): Promise<DictionaryEntry | null> {
    try {
      const data = await this.env.DECODER_KV?.get(`decoder:term:${term.toLowerCase()}`);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  // 获取统计信息
  getStats(): {
    global: any;
    categories: Record<string, any>;
    books: Record<string, any>;
  } {
    const categories: Record<string, any> = {};
    for (const [type, index] of this.categoryDicts) {
      categories[type] = index.getStats();
    }

    const books: Record<string, any> = {};
    for (const [bookId, index] of this.bookDicts) {
      books[bookId] = index.getStats();
    }

    return {
      global: this.globalDict.getStats(),
      categories,
      books
    };
  }

  // 获取热门词汇
  getHotTerms(): { global: string[]; categories: Record<string, string[]>; books: Record<string, string[]> } {
    const categories: Record<string, string[]> = {};
    for (const [type, index] of this.categoryDicts) {
      categories[type] = index.getHotTerms();
    }

    const books: Record<string, string[]> = {};
    for (const [bookId, index] of this.bookDicts) {
      books[bookId] = index.getHotTerms();
    }

    return {
      global: this.globalDict.getHotTerms(),
      categories,
      books
    };
  }
}