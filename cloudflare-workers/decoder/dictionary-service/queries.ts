import type { BookType, DictionaryEntry } from '../../shared/types.ts'
import { OptimizedDictionaryIndex } from './index.ts'

export function getScopedIndices(
  globalDict: OptimizedDictionaryIndex,
  categoryDicts: Map<BookType, OptimizedDictionaryIndex>,
  bookDicts: Map<string, OptimizedDictionaryIndex>,
  bookId?: string,
  bookType?: BookType
): OptimizedDictionaryIndex[] {
  const scopedIndices: OptimizedDictionaryIndex[] = []

  if (bookId) {
    const bookIndex = bookDicts.get(bookId)
    if (bookIndex) {
      scopedIndices.push(bookIndex)
    }
  }

  if (bookType) {
    const categoryIndex = categoryDicts.get(bookType)
    if (categoryIndex) {
      scopedIndices.push(categoryIndex)
    }
  }

  scopedIndices.push(globalDict)
  return scopedIndices
}

export function findExactInIndices(
  term: string,
  scopedIndices: OptimizedDictionaryIndex[]
): DictionaryEntry[] {
  for (const index of scopedIndices) {
    const results = index.findExact(term)
    if (results.length > 0) {
      return results
    }
  }

  return []
}

export function findFuzzyInIndices(
  term: string,
  scopedIndices: OptimizedDictionaryIndex[]
): DictionaryEntry[] {
  const allResults = scopedIndices.flatMap(index => index.findFuzzy(term))

  const uniqueResults = allResults.filter((entry, entryIndex, collection) =>
    collection.findIndex(candidate => candidate.id === entry.id) === entryIndex
  )

  return uniqueResults.sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
}
