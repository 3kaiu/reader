import {
  batchDeleteDictionaryEntries as apiBatchDeleteDictionaryEntries,
  deleteDictionaryEntry as apiDeleteDictionaryEntry,
  exportDictionary,
  getDictionary,
  importDictionary,
  updateDictionary,
} from '@/api/decoder'
import type {
  DictionaryEntry,
  DictionaryLevel,
} from '@/types/decoder'
import {
  sanitizeBookType,
  sanitizeLevel,
} from './helpers'
import type {
  DecoderActionErrorState,
  DecoderDictionaryBatchDeleteParams,
  DecoderDictionaryDeleteParams,
  DecoderDictionaryEntryInput,
  DecoderDictionaryQuery,
} from './types'

export function createDecoderDictionaryActions(error: DecoderActionErrorState) {
  const loadDictionary = async (params?: DecoderDictionaryQuery) => {
    const result = await getDictionary({
      level: params?.level,
      bookId: params?.bookId,
      category: sanitizeBookType(params?.category),
    })
    return result.entries || []
  }

  const addEntry = async (
    entry: DecoderDictionaryEntryInput,
    level: DictionaryLevel = 'global',
    bookId?: string,
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
    params?: DecoderDictionaryDeleteParams,
  ) =>
    await apiDeleteDictionaryEntry(entryId, {
      level: params?.level ? sanitizeLevel(params.level) : undefined,
      bookId: params?.bookId,
      category: sanitizeBookType(params?.category),
    })

  const batchDeleteDictionaryEntries = async (
    data: DecoderDictionaryBatchDeleteParams,
  ) =>
    await apiBatchDeleteDictionaryEntries({
      ids: data.ids,
      level: data.level ? sanitizeLevel(data.level) : undefined,
      bookId: data.bookId,
      category: sanitizeBookType(data.category),
    })

  const exportEntries = async () => {
    const result = await exportDictionary()
    return result.entries || []
  }

  const importEntries = async (entries: DictionaryEntry[]) => {
    return await importDictionary(entries)
  }

  return {
    loadDictionary,
    addEntry,
    deleteDictionaryEntry,
    batchDeleteDictionaryEntries,
    exportEntries,
    importEntries,
  }
}
