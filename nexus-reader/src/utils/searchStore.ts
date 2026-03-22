import type { SearchResult } from '@/types/search'

export function buildAvailableSources(results: SearchResult[]): string[] {
  const sources = new Set<string>()

  results.forEach(book => {
    if (book.sourceName) {
      sources.add(book.sourceName)
    }
  })

  return Array.from(sources).sort()
}

export function filterSearchResultsBySources(
  results: SearchResult[],
  selectedSources: Set<string>
): SearchResult[] {
  if (selectedSources.size === 0) {
    return results
  }

  return results.filter(book => selectedSources.has(book.sourceName || ''))
}

export function appendSearchHistory(
  history: string[],
  query: string,
  limit: number
): string[] {
  if (history.includes(query)) {
    return history
  }

  return [query, ...history.slice(0, limit - 1)]
}

export function toggleSelectedSource(
  selectedSources: Set<string>,
  source: string
): Set<string> {
  const nextSources = new Set(selectedSources)

  if (nextSources.has(source)) {
    nextSources.delete(source)
  } else {
    nextSources.add(source)
  }

  return nextSources
}
