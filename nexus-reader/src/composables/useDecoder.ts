import { ref } from 'vue'
import {
  batchDeleteDictionaryEntries as apiBatchDeleteDictionaryEntries,
  confirmEntry as apiConfirmEntry,
  decodeChapter as apiDecodeChapter,
  deleteDictionaryEntry as apiDeleteDictionaryEntry,
  exportDictionary,
  getDictionary,
  importDictionary,
  updateDictionary,
} from '@/api/decoder'
import type {
  BookType,
  DecodeResponse,
  DictionaryEntry,
  DictionaryLevel,
  EntityCategory,
} from '@/types/decoder'

function sanitizeLevel(level?: DictionaryLevel): DictionaryLevel {
  if (level === 'global' || level === 'category' || level === 'book') {
    return level
  }
  return 'global'
}

function sanitizeBookType(value?: string): BookType | undefined {
  if (
    value === 'era' ||
    value === 'entertainment' ||
    value === 'urban' ||
    value === 'history' ||
    value === 'business'
  ) {
    return value
  }
  return undefined
}

function sanitizeEntityCategory(value?: string): EntityCategory {
  if (
    value === 'person' ||
    value === 'company' ||
    value === 'place' ||
    value === 'event' ||
    value === 'organization'
  ) {
    return value
  }
  return 'person'
}

function buildDictionaryEntry(
  entity: {
    id?: string
    original: string
    bestMatch?: { real: string; confidence: number; category: string } | null
  },
  overrideReal?: string
): Partial<DictionaryEntry> {
  const bestMatch = entity.bestMatch ?? null
  return {
    id: entity.id,
    original: entity.original,
    real: overrideReal || bestMatch?.real || entity.original,
    category: sanitizeEntityCategory(bestMatch?.category),
    confidence: bestMatch?.confidence || 100,
    source: 'user',
  }
}

export function useDecoder() {
  const error = ref<string | null>(null)

  const decodeChapter = async (
    bookId: string,
    chapterId: string,
    content: string,
    meta?: { type?: BookType; tags?: string[]; era?: string }
  ): Promise<DecodeResponse | null> => {
    if (!bookId || !chapterId || !content) {
      error.value = '缺少解码所需参数'
      return null
    }

    try {
      error.value = null
      return await apiDecodeChapter({
        bookId,
        chapterId,
        content,
        bookMeta: meta?.type
          ? {
              type: meta.type,
              tags: meta.tags,
              era: meta.era,
            }
          : undefined,
      })
    } catch (err) {
      error.value = err instanceof Error ? err.message : '解码失败'
      return null
    }
  }

  const loadDictionary = async (params?: {
    level?: DictionaryLevel | 'all'
    bookId?: string
    category?: string
  }) => {
    const result = await getDictionary({
      level: params?.level,
      bookId: params?.bookId,
      category: sanitizeBookType(params?.category),
    })
    return result.entries || []
  }

  const addEntry = async (
    entry: Partial<DictionaryEntry>,
    level: DictionaryLevel = 'global',
    bookId?: string
  ) => {
    error.value = null
    try {
      const targetLevel = level === 'book' && !bookId ? 'global' : sanitizeLevel(level)
      const result = await updateDictionary({
        entry,
        level: targetLevel,
        bookId,
        promote: false,
      })
      return result.success
    } catch (err) {
      error.value = err instanceof Error ? err.message : '保存失败'
      return false
    }
  }

  const deleteDictionaryEntry = async (
    entryId: string,
    params?: {
      level?: DictionaryLevel
      bookId?: string
      category?: string
    }
  ) => {
    return await apiDeleteDictionaryEntry(entryId, {
      level: params?.level ? sanitizeLevel(params.level) : undefined,
      bookId: params?.bookId,
      category: sanitizeBookType(params?.category),
    })
  }

  const batchDeleteDictionaryEntries = async (data: {
    ids: string[]
    level?: DictionaryLevel
    bookId?: string
    category?: string
  }) => {
    return await apiBatchDeleteDictionaryEntries({
      ids: data.ids,
      level: data.level ? sanitizeLevel(data.level) : undefined,
      bookId: data.bookId,
      category: sanitizeBookType(data.category),
    })
  }

  const exportEntries = async () => {
    const result = await exportDictionary()
    return result.entries || []
  }

  const importEntries = async (entries: DictionaryEntry[]) => {
    return await importDictionary(entries)
  }

  const confirmEntity = async (
    entity: {
      id?: string
      original: string
      bestMatch?: { real: string; confidence: number; category: string } | null
    },
    bookId: string,
    bookType?: BookType
  ) => {
    if (!entity.bestMatch) {
      error.value = '缺少可确认的解码结果'
      return false
    }

    try {
      error.value = null
      const result = await apiConfirmEntry({
        entry: buildDictionaryEntry(entity),
        bookId,
        bookType,
      })
      return result.success
    } catch (err) {
      error.value = err instanceof Error ? err.message : '确认失败'
      return false
    }
  }

  const correctEntity = async (
    entity: {
      id?: string
      original: string
      bestMatch?: { real: string; confidence: number; category: string } | null
    },
    newReal: string,
    bookId: string,
    _bookType?: BookType
  ) => {
    try {
      error.value = null
      const result = await updateDictionary({
        entry: buildDictionaryEntry(entity, newReal),
        level: 'book',
        bookId,
        promote: false,
      })
      return result.success
    } catch (err) {
      error.value = err instanceof Error ? err.message : '纠正失败'
      return false
    }
  }

  return {
    error,
    decodeChapter,
    loadDictionary,
    addEntry,
    deleteDictionaryEntry,
    batchDeleteDictionaryEntries,
    exportEntries,
    importEntries,
    confirmEntity,
    correctEntity,
  }
}
