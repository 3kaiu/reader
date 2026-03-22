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
}

export interface SearchResponse {
  results: SearchResult[]
  total: number
}
