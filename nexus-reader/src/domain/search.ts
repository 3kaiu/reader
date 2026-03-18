/**
 * Search Domain Layer
 *
 * Defines search-related business logic and entities
 */

import { reactive } from 'vue'

export interface SearchQuery {
  keywords: string[]
  filters: SearchFilters
  sortBy: SearchSort
  page: number
  pageSize: number
}

export interface SearchFilters {
  author?: string
  genre?: string
  status?: string
  ratingMin?: number
  ratingMax?: number
  wordCountMin?: number
  wordCountMax?: number
  tags?: string[]
}

export type SearchSort = 'relevance' | 'popularity' | 'rating' | 'updateDate' | 'title' | 'author'

export interface SearchResult {
  id: string
  query: SearchQuery
  items: SearchResultItem[]
  totalCount: number
  executionTime: number
  searchTimestamp: Date
}

export interface SearchResultItem {
  bookId: string
  title: string
  author: string
  description?: string
  coverUrl?: string
  genres: string[]
  rating?: number
  status: string
  wordCount: number
  relevanceScore: number
  matchedKeywords: string[]
  highlights: string[]
}

export interface RecommendationContext {
  currentBookId?: string
  recentlyRead: string[]
  favoriteGenres: string[]
  favoriteAuthors: string[]
  timeOfDay: number
  deviceType: 'mobile' | 'tablet' | 'desktop'
}

export interface RecommendationItem {
  bookId: string
  score: number
  reason: string
  algorithmUsed: string
  confidence: number
  features: string[]
}

// Search domain state
const searchState = reactive({
  currentQuery: null as SearchQuery | null,
  searchHistory: [] as SearchQuery[],
  recommendations: [] as RecommendationItem[],
  isSearching: false,
  lastSearchTime: null as Date | null,
})

// Export reactive state
export { searchState }
