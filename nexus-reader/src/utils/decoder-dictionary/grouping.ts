import type { DictionaryEntry } from '@/types/decoder'
import { getDecoderEntryBookType } from './scope'
import type { DecoderDictionaryDeleteRequest } from './types'

export function upsertDictionaryEntries(
  existingEntries: DictionaryEntry[],
  incomingEntries: DictionaryEntry[]
): DictionaryEntry[] {
  const nextEntries = [...existingEntries]

  for (const entry of incomingEntries) {
    const index = nextEntries.findIndex(existingEntry => existingEntry.id === entry.id)
    if (index === -1) {
      nextEntries.unshift(entry)
      continue
    }

    nextEntries[index] = {
      ...nextEntries[index],
      ...entry,
    }
  }

  return nextEntries
}

export function groupDecoderEntriesByScope(
  entries: DictionaryEntry[]
): DecoderDictionaryDeleteRequest[] {
  const groupedRequests = new Map<string, DecoderDictionaryDeleteRequest>()

  for (const entry of entries) {
    const category = getDecoderEntryBookType(entry)
    const key = [entry.level, entry.bookId || '', category || ''].join('::')
    const existing = groupedRequests.get(key)

    if (existing) {
      existing.ids.push(entry.id)
      continue
    }

    groupedRequests.set(key, {
      ids: [entry.id],
      level: entry.level,
      bookId: entry.bookId,
      category,
    })
  }

  return Array.from(groupedRequests.values())
}
