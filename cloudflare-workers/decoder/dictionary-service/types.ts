export interface DictionaryIndexStats {
  totalEntries: number
  cacheSize: number
  hotTermsCount: number
}

export interface DictionaryServiceStats {
  global: DictionaryIndexStats
  categories: Record<string, DictionaryIndexStats>
  books: Record<string, DictionaryIndexStats>
}

export interface DictionaryHotTerms {
  global: string[]
  categories: Record<string, string[]>
  books: Record<string, string[]>
}
