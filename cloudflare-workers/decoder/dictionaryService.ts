/**
 * Dictionary Service (词典服务)
 * 职责：管理多级词典查找、加载及自动提升逻辑
 * 优化版本：Trie树索引 + 智能缓存 + 并发加载
 */

import {
  type DictionaryEntry,
  type BookType,
  type WorkerEnv
} from '../shared/types.ts'
import { type Logger } from '../shared/logger.ts'
import { OptimizedDictionaryIndex } from './dictionary-service/index.ts'
import { loadDictionaryIndex } from './dictionary-service/loading.ts'
import {
  findExactInIndices,
  findFuzzyInIndices,
  getScopedIndices,
} from './dictionary-service/queries.ts'
import {
  buildDictionaryHotTerms,
  buildDictionaryStats,
} from './dictionary-service/stats.ts'
import type {
  DictionaryHotTerms,
  DictionaryServiceStats,
} from './dictionary-service/types.ts'

export class DictionaryService {
  private globalDict: OptimizedDictionaryIndex = new OptimizedDictionaryIndex()
  private categoryDicts: Map<BookType, OptimizedDictionaryIndex> = new Map()
  private bookDicts: Map<string, OptimizedDictionaryIndex> = new Map()
  private env: WorkerEnv
  private logger: Logger
  private globalLoaded = false
  private loadedCategories: Set<BookType> = new Set()
  private loadedBooks: Set<string> = new Set()
  private pendingLoads: Map<string, Promise<void>> = new Map()
  private static readonly MAX_GLOBAL_ENTRIES = 5000
  private static readonly MAX_CATEGORY_ENTRIES = 2000
  private static readonly MAX_BOOK_ENTRIES = 500

  constructor(env: WorkerEnv, logger: Logger) {
    this.env = env
    this.logger = logger
  }

  async load(bookId?: string, bookType?: BookType): Promise<void> {
    await this.performConcurrentLoad(bookId, bookType)
  }

  private async performConcurrentLoad(bookId?: string, bookType?: BookType): Promise<void> {
    const loadTasks: Promise<void>[] = [this.ensureGlobalDictLoaded()]

    if (bookType) {
      loadTasks.push(this.ensureCategoryDictLoaded(bookType))
    }

    if (bookId) {
      loadTasks.push(this.ensureBookDictLoaded(bookId))
    }

    await Promise.all(loadTasks)
    this.logger.info(`Dictionary loaded: global + ${bookType ? 'category ' : ''}${bookId ? '+ book' : ''}`)
  }

  private async runScopedLoad(
    scopeKey: string,
    loader: () => Promise<void>
  ): Promise<void> {
    const existingLoad = this.pendingLoads.get(scopeKey)
    if (existingLoad) {
      return existingLoad
    }

    const loadPromise = (async () => {
      try {
        await loader()
      } finally {
        this.pendingLoads.delete(scopeKey)
      }
    })()

    this.pendingLoads.set(scopeKey, loadPromise)
    await loadPromise
  }

  private async ensureGlobalDictLoaded(): Promise<void> {
    if (this.globalLoaded) {
      return
    }

    await this.runScopedLoad('global', async () => {
      try {
        const index = await loadDictionaryIndex(
          this.env,
          'decoder:dict:global',
          DictionaryService.MAX_GLOBAL_ENTRIES
        )

        if (index) {
          this.globalDict = index
        }

        this.globalLoaded = true
      } catch (error) {
        this.logger.error('Failed to load global dictionary:', error)
      }
    })
  }

  private async ensureCategoryDictLoaded(type: BookType): Promise<void> {
    if (this.loadedCategories.has(type)) {
      return
    }

    await this.runScopedLoad(`category:${type}`, async () => {
      try {
        const index = await loadDictionaryIndex(
          this.env,
          `decoder:dict:category:${type}`,
          DictionaryService.MAX_CATEGORY_ENTRIES
        )

        if (index) {
          this.categoryDicts.set(type, index)
        }

        this.loadedCategories.add(type)
      } catch (error) {
        this.logger.error(`Failed to load category dictionary ${type}:`, error)
      }
    })
  }

  private async ensureBookDictLoaded(bookId: string): Promise<void> {
    if (this.loadedBooks.has(bookId)) {
      return
    }

    await this.runScopedLoad(`book:${bookId}`, async () => {
      try {
        const index = await loadDictionaryIndex(
          this.env,
          `decoder:book:${bookId}:dictionary`,
          DictionaryService.MAX_BOOK_ENTRIES
        )

        if (index) {
          this.bookDicts.set(bookId, index)
        }

        this.loadedBooks.add(bookId)
      } catch (error) {
        this.logger.error(`Failed to load book dictionary ${bookId}:`, error)
      }
    })
  }

  lookup(term: string, bookId?: string, bookType?: BookType, fuzzy = false): DictionaryEntry | null {
    const scopedIndices = this.getScopedIndices(bookId, bookType)
    let results = findExactInIndices(term, scopedIndices)
    if (results.length > 0) {
      return results[0]
    }

    if (fuzzy) {
      results = findFuzzyInIndices(term, scopedIndices)
      if (results.length > 0) {
        return results[0]
      }
    }

    return null
  }

  private getScopedIndices(bookId?: string, bookType?: BookType): OptimizedDictionaryIndex[] {
    return getScopedIndices(this.globalDict, this.categoryDicts, this.bookDicts, bookId, bookType)
  }

  async lookupAsync(term: string): Promise<DictionaryEntry | null> {
    try {
      const data = await this.env.DECODER_KV?.get(`decoder:term:${term.toLowerCase()}`)
      return data ? JSON.parse(data) : null
    } catch {
      return null
    }
  }

  getStats(): DictionaryServiceStats {
    return buildDictionaryStats(this.globalDict, this.categoryDicts, this.bookDicts)
  }

  getHotTerms(): DictionaryHotTerms {
    return buildDictionaryHotTerms(this.globalDict, this.categoryDicts, this.bookDicts)
  }
}
