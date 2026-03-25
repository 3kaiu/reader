import type { DictionaryEntry } from '@/types/decoder'
import { getDecoderEntryBookType } from './scope'
import type { DecoderTransferEntry } from './types'

export function toDecoderTransferEntry(entry: DictionaryEntry): DecoderTransferEntry {
  return {
    original: entry.original,
    real: entry.real,
    category: entry.category,
    aliases: entry.aliases?.length ? entry.aliases : undefined,
    description: entry.description || undefined,
    level: entry.level,
    bookId: entry.bookId,
    bookType: getDecoderEntryBookType(entry),
  }
}
