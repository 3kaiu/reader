import type {
  DictionaryEntry,
  DictionaryLevel,
  EntityCategory,
} from '@/types/decoder'

export function filterDecoderEntries(
  entries: DictionaryEntry[],
  options: {
    searchKeyword?: string
    filterCategory?: EntityCategory | 'all'
    filterLevel?: DictionaryLevel | 'all'
  }
): DictionaryEntry[] {
  let result = entries

  const keyword = options.searchKeyword?.trim().toLowerCase()
  if (keyword) {
    result = result.filter(
      entry =>
        entry.original.toLowerCase().includes(keyword) ||
        entry.real.toLowerCase().includes(keyword) ||
        (entry.description || '').toLowerCase().includes(keyword)
    )
  }

  if (options.filterCategory && options.filterCategory !== 'all') {
    result = result.filter(entry => entry.category === options.filterCategory)
  }

  if (options.filterLevel && options.filterLevel !== 'all') {
    result = result.filter(entry => entry.level === options.filterLevel)
  }

  return result
}

export function pickDecoderEntriesByIds(
  entries: DictionaryEntry[],
  ids: Iterable<string>
): DictionaryEntry[] {
  const idSet = new Set(Array.from(ids).filter(Boolean))
  if (idSet.size === 0) {
    return []
  }

  return entries.filter(entry => idSet.has(entry.id))
}
