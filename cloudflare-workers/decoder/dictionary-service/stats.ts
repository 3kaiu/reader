import type { BookType } from '../../shared/types.ts'
import { OptimizedDictionaryIndex } from './index.ts'
import type {
  DictionaryHotTerms,
  DictionaryIndexStats,
  DictionaryServiceStats,
} from './types.ts'

function mapIndexStats<T>(
  indexes: Map<string, OptimizedDictionaryIndex>,
  selector: (index: OptimizedDictionaryIndex) => T
): Record<string, T> {
  const result: Record<string, T> = {}

  for (const [key, index] of indexes) {
    result[key] = selector(index)
  }

  return result
}

export function buildDictionaryStats(
  globalDict: OptimizedDictionaryIndex,
  categoryDicts: Map<BookType, OptimizedDictionaryIndex>,
  bookDicts: Map<string, OptimizedDictionaryIndex>
): DictionaryServiceStats {
  return {
    global: globalDict.getStats(),
    categories: mapIndexStats(categoryDicts as Map<string, OptimizedDictionaryIndex>, index => index.getStats()),
    books: mapIndexStats(bookDicts, index => index.getStats()),
  }
}

export function buildDictionaryHotTerms(
  globalDict: OptimizedDictionaryIndex,
  categoryDicts: Map<BookType, OptimizedDictionaryIndex>,
  bookDicts: Map<string, OptimizedDictionaryIndex>
): DictionaryHotTerms {
  return {
    global: globalDict.getHotTerms(),
    categories: mapIndexStats(categoryDicts as Map<string, OptimizedDictionaryIndex>, index => index.getHotTerms()),
    books: mapIndexStats(bookDicts, index => index.getHotTerms()),
  }
}
