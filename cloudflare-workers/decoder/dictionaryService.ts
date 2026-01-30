/**
 * Dictionary Service (词典服务)
 * 职责：管理多级词典查找、加载及自动提升逻辑
 */

import {
  type DictionaryEntry,
  type DictionaryLevel,
  type BookType,
  type EntryConfirmation,
  type WorkerEnv
} from '../shared/types.ts';
import { type Logger } from '../shared/logger.ts';

/** 词典索引 */
class DictionaryIndex {
  private exact: Map<string, DictionaryEntry[]> = new Map();

  addEntry(entry: DictionaryEntry): void {
    const exactKey = entry.original.toLowerCase();
    const exactList = this.exact.get(exactKey) || [];
    exactList.push(entry);
    this.exact.set(exactKey, exactList);
  }

  findExact(term: string): DictionaryEntry[] {
    return this.exact.get(term.toLowerCase()) || [];
  }
}

export class DictionaryService {
  private globalDict: DictionaryIndex = new DictionaryIndex();
  private categoryDicts: Map<BookType, DictionaryIndex> = new Map();
  private bookDicts: Map<string, DictionaryIndex> = new Map();

  private env: WorkerEnv;
  private logger: Logger;
  private loaded = false;

  private static readonly MAX_GLOBAL_ENTRIES = 5000;
  private static readonly MAX_CATEGORY_ENTRIES = 2000;
  private static readonly MAX_BOOK_ENTRIES = 500;

  constructor(env: WorkerEnv, logger: Logger) {
    this.env = env;
    this.logger = logger;
  }

  async load(bookId?: string, bookType?: BookType): Promise<void> {
    if (this.loaded) return;
    await Promise.all([
      this.loadGlobalDict(),
      bookType ? this.loadCategoryDict(bookType) : Promise.resolve(),
      bookId ? this.loadBookDict(bookId) : Promise.resolve()
    ]);
    this.loaded = true;
  }

  private async loadGlobalDict(): Promise<void> {
    try {
      const mainData = await this.env.DECODER_KV?.get('decoder:dict:global');
      if (mainData) {
        const entries: DictionaryEntry[] = JSON.parse(mainData);
        entries.slice(0, DictionaryService.MAX_GLOBAL_ENTRIES).forEach(e => this.globalDict.addEntry(e));
      }
    } catch (e) {
      this.logger.error('Failed to load global dictionary:', e);
    }
  }

  private async loadCategoryDict(type: BookType): Promise<void> {
    try {
      const data = await this.env.DECODER_KV?.get(`decoder:dict:category:${type}`);
      if (data) {
        const index = new DictionaryIndex();
        const entries: DictionaryEntry[] = JSON.parse(data);
        entries.slice(0, DictionaryService.MAX_CATEGORY_ENTRIES).forEach(e => index.addEntry(e));
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
        const index = new DictionaryIndex();
        const entries: DictionaryEntry[] = JSON.parse(data);
        entries.slice(0, DictionaryService.MAX_BOOK_ENTRIES).forEach(e => index.addEntry(e));
        this.bookDicts.set(bookId, index);
      }
    } catch (e) {
      this.logger.error(`Failed to load book dictionary ${bookId}:`, e);
    }
  }

  lookup(term: string, bookId?: string, bookType?: BookType): DictionaryEntry | null {
    if (bookId) {
      const bookIndex = this.bookDicts.get(bookId);
      const results = bookIndex?.findExact(term);
      if (results?.length) return results[0];
    }

    if (bookType) {
      const categoryIndex = this.categoryDicts.get(bookType);
      const results = categoryIndex?.findExact(term);
      if (results?.length) return results[0];
    }

    const globalResults = this.globalDict.findExact(term);
    return globalResults.length > 0 ? globalResults[0] : null;
  }

  async lookupAsync(term: string): Promise<DictionaryEntry | null> {
    try {
      const data = await this.env.DECODER_KV?.get(`decoder:term:${term.toLowerCase()}`);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }
}
