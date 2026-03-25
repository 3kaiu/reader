import type { BookType, DictionaryEntry } from '@/types/decoder'
import { isDecoderBookType } from './guards'

export function getDecoderEntryBookType(
  entry?: Partial<DictionaryEntry> | null
): BookType | undefined {
  const tag = entry?.categoryTags?.[0]
  if (isDecoderBookType(tag)) {
    return tag
  }
  return undefined
}

export function getDecoderEntryScopeLabel(entry?: Partial<DictionaryEntry> | null): string {
  if (!entry?.level) return '公共词典'

  if (entry.level === 'book') {
    return entry.bookId ? `书籍词典 · ${entry.bookId}` : '书籍词典'
  }

  if (entry.level === 'category') {
    const bookType = getDecoderEntryBookType(entry)
    return bookType ? `分类词典 · ${bookType}` : '分类词典'
  }

  return '公共词典'
}
