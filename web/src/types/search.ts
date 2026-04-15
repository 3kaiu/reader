export type SearchExplainStrategy = 'native_search' | 'direct_detail' | 'external_discovery'

export interface SearchExplain {
  strategy: SearchExplainStrategy
  provider: string
  matchScore?: number
  packageRank?: number
  note?: string
}

export interface SearchResult {
  bookUrl: string
  name: string
  author?: string
  coverUrl?: string
  intro?: string
  sourceId: string
  sourceName: string
  latestChapter?: string
  latestChapterTitle?: string
  searchExplain?: SearchExplain
  packageId?: string
}

export interface SearchDisplayResult extends SearchResult {
  sourceCount: number
  matchedSources: SearchSourceOption[]
  sourceVariants: SearchResult[]
}

export interface SearchResultActionPayload {
  book: SearchResult
  rememberPreference?: boolean
}

export interface SearchError {
  sourceId: string
  error: string
}

export interface SearchSourceOption {
  id: string
  name: string
}

export interface SearchResponse {
  results: SearchResult[]
  total: number
  errors?: SearchError[]
}
