import {
  confirmEntry as apiConfirmEntry,
  updateDictionary,
} from '@/api/decoder'
import type { BookType } from '@/types/decoder'
import { buildDictionaryEntry } from './helpers'
import type {
  DecoderActionErrorState,
  DecoderEntityInput,
} from './types'

export function createDecoderEntityActions(error: DecoderActionErrorState) {
  const confirmEntity = async (
    entity: DecoderEntityInput,
    bookId: string,
    bookType?: BookType,
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
    entity: DecoderEntityInput,
    newReal: string,
    bookId: string,
    _bookType?: BookType,
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
    confirmEntity,
    correctEntity,
  }
}
