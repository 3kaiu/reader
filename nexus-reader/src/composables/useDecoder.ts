/**
 * 网文解密 Composable
 * 提供章节解密、词典管理、实体高亮等功能
 */
import { ref, computed, shallowRef } from 'vue'
import { logger } from '@/utils/logger'
import * as decoderApi from '@/api/decoder'
import type {
  DecodeResponse,
  DecodedEntity,
  DictionaryEntry,
  BookMeta,
  BookState,
  BookType,
  DictionaryLevel,
} from '@/types/decoder'

// 全局状态
const isLoading = ref(false)
const error = ref<string | null>(null)
const lastDecodeResult = shallowRef<DecodeResponse | null>(null)
const currentBookState = shallowRef<BookState | null>(null)
const dictionary = shallowRef<DictionaryEntry[]>([])

// 缓存已解码的章节
const decodeCache = new Map<string, DecodeResponse>()

/**
 * 网文解密 Composable
 */
export function useDecoder() {
  /**
   * 解码章节内容
   */
  async function decodeChapter(
    bookId: string,
    chapterId: string,
    content: string,
    bookMeta?: BookMeta
  ): Promise<DecodeResponse | null> {
    // 检查缓存
    const cacheKey = `${bookId}:${chapterId}`
    const cached = decodeCache.get(cacheKey)
    if (cached) {
      lastDecodeResult.value = cached
      return cached
    }

    isLoading.value = true
    error.value = null

    try {
      const result = await decoderApi.decodeChapter({
        bookId,
        chapterId,
        content,
        bookMeta,
      })

      // 缓存结果
      decodeCache.set(cacheKey, result)
      lastDecodeResult.value = result

      logger.info('章节解码完成', {
        function: 'decodeChapter',
        chapterId,
        entitiesCount: result.entities.length,
        cached: result.cached,
      })

      return result
    } catch (e) {
      const msg = e instanceof Error ? e.message : '解码失败'
      error.value = msg
      logger.error('章节解码失败', e as Error, { function: 'decodeChapter', chapterId })
      return null
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 获取实体在文本中的高亮位置
   */
  function getHighlightRanges(entities: DecodedEntity[]): Array<{
    start: number
    end: number
    entity: DecodedEntity
  }> {
    return entities
      .filter((e) => e.bestMatch !== null)
      .map((entity) => ({
        start: entity.position.start,
        end: entity.position.end,
        entity,
      }))
      .sort((a, b) => a.start - b.start)
  }

  /**
   * 将文本按实体位置分割，用于渲染高亮
   */
  function splitTextWithEntities(
    text: string,
    entities: DecodedEntity[]
  ): Array<{ type: 'text' | 'entity'; content: string; entity?: DecodedEntity }> {
    const ranges = getHighlightRanges(entities)
    const result: Array<{ type: 'text' | 'entity'; content: string; entity?: DecodedEntity }> = []

    let lastEnd = 0
    for (const range of ranges) {
      // 添加实体前的普通文本
      if (range.start > lastEnd) {
        result.push({
          type: 'text',
          content: text.slice(lastEnd, range.start),
        })
      }

      // 添加实体
      result.push({
        type: 'entity',
        content: text.slice(range.start, range.end),
        entity: range.entity,
      })

      lastEnd = range.end
    }

    // 添加最后的普通文本
    if (lastEnd < text.length) {
      result.push({
        type: 'text',
        content: text.slice(lastEnd),
      })
    }

    return result
  }

  /**
   * 确认词条（用户确认解码结果正确）
   */
  async function confirmEntity(
    entity: DecodedEntity,
    bookId: string,
    bookType?: BookType
  ): Promise<boolean> {
    if (!entity.bestMatch) return false

    try {
      const entry: DictionaryEntry = {
        id: entity.id,
        original: entity.original,
        real: entity.bestMatch.real,
        category: entity.bestMatch.category,
        level: 'book',
        bookId,
        confidence: entity.bestMatch.confidence,
        confirmCount: 1,
        source: 'user',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      const result = await decoderApi.confirmEntry({
        entry,
        bookId,
        bookType,
      })

      if (result.promoted) {
        logger.info('词条已提升到分类词典', {
          function: 'confirmEntity',
          original: entity.original,
          real: entity.bestMatch.real,
        })
      }

      return result.success
    } catch (e) {
      logger.error('确认词条失败', e as Error, { function: 'confirmEntity' })
      return false
    }
  }

  /**
   * 纠正词条（用户提供正确的解码）
   */
  async function correctEntity(
    entity: DecodedEntity,
    correctReal: string,
    bookId: string,
    _bookType?: BookType
  ): Promise<boolean> {
    try {
      const result = await decoderApi.updateDictionary({
        entry: {
          id: entity.id,
          original: entity.original,
          real: correctReal,
          category: entity.bestMatch?.category || 'person',
          confidence: 90, // 用户纠正的置信度较高
        },
        level: 'book',
        bookId,
      })

      // 清除缓存，下次重新解码
      for (const key of decodeCache.keys()) {
        if (key.startsWith(bookId)) {
          decodeCache.delete(key)
        }
      }

      return result.success
    } catch (e) {
      logger.error('纠正词条失败', e as Error, { function: 'correctEntity' })
      return false
    }
  }

  /**
   * 加载词典
   */
  async function loadDictionary(params?: {
    level?: DictionaryLevel | 'all'
    bookId?: string
    category?: BookType
  }): Promise<DictionaryEntry[]> {
    try {
      const result = await decoderApi.getDictionary(params)
      dictionary.value = result.entries
      return result.entries
    } catch (e) {
      logger.error('加载词典失败', e as Error, { function: 'loadDictionary' })
      return []
    }
  }

  /**
   * 添加词条
   */
  async function addEntry(
    entry: Partial<DictionaryEntry>,
    level: DictionaryLevel,
    bookId?: string
  ): Promise<boolean> {
    try {
      const result = await decoderApi.updateDictionary({
        entry,
        level,
        bookId,
      })

      if (result.success) {
        // 更新本地词典
        dictionary.value = [...dictionary.value, result.entry]
      }

      return result.success
    } catch (e) {
      logger.error('添加词条失败', e as Error, { function: 'addEntry' })
      return false
    }
  }

  /**
   * 导入词典
   */
  async function importEntries(entries: DictionaryEntry[]): Promise<{
    success: boolean
    imported: number
    total: number
  }> {
    try {
      const result = await decoderApi.importDictionary(entries)
      if (result.success) {
        // 重新加载词典
        await loadDictionary()
      }
      return result
    } catch (e) {
      logger.error('导入词典失败', e as Error, { function: 'importEntries' })
      return { success: false, imported: 0, total: 0 }
    }
  }

  /**
   * 导出词典
   */
  async function exportEntries(): Promise<DictionaryEntry[]> {
    try {
      const result = await decoderApi.exportDictionary()
      return result.entries
    } catch (e) {
      logger.error('导出词典失败', e as Error, { function: 'exportEntries' })
      return []
    }
  }

  /**
   * 获取书籍状态
   */
  async function getBookState(bookId: string): Promise<BookState | null> {
    try {
      const state = await decoderApi.getBookState(bookId)
      currentBookState.value = state
      return state
    } catch (e) {
      // 404 是正常的（书籍还没有状态）
      if ((e as any)?.response?.status !== 404) {
        logger.error('获取书籍状态失败', e as Error, { function: 'getBookState' })
      }
      return null
    }
  }

  /**
   * 初始化书籍状态
   */
  async function initBookState(bookId: string, meta: BookMeta): Promise<BookState | null> {
    try {
      const state = await decoderApi.updateBookState(bookId, { meta })
      currentBookState.value = state
      return state
    } catch (e) {
      logger.error('初始化书籍状态失败', e as Error, { function: 'initBookState' })
      return null
    }
  }

  /**
   * 清除解码缓存
   */
  function clearCache(bookId?: string) {
    if (bookId) {
      for (const key of decodeCache.keys()) {
        if (key.startsWith(bookId)) {
          decodeCache.delete(key)
        }
      }
    } else {
      decodeCache.clear()
    }
    lastDecodeResult.value = null
  }

  /**
   * 检查解码服务是否可用
   */
  async function checkHealth(): Promise<boolean> {
    try {
      const result = await decoderApi.checkDecoderHealth()
      return result.status === 'ok'
    } catch {
      return false
    }
  }

  return {
    // 状态
    isLoading: computed(() => isLoading.value),
    error: computed(() => error.value),
    lastDecodeResult: computed(() => lastDecodeResult.value),
    currentBookState: computed(() => currentBookState.value),
    dictionary: computed(() => dictionary.value),

    // 解码方法
    decodeChapter,
    getHighlightRanges,
    splitTextWithEntities,

    // 词条管理
    confirmEntity,
    correctEntity,
    addEntry,
    loadDictionary,
    importEntries,
    exportEntries,

    // 书籍状态
    getBookState,
    initBookState,

    // 工具方法
    clearCache,
    checkHealth,
  }
}

// 导出单例
let instance: ReturnType<typeof useDecoder> | null = null

export function useGlobalDecoder() {
  if (!instance) {
    instance = useDecoder()
  }
  return instance
}
