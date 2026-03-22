import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'
import { searchApi } from '@/api/search'
import type { ApiResponse } from '@/api/http/types'
import type { SearchResponse, SearchResult } from '@/types/search'
import {
  appendSearchHistory,
  buildAvailableSources,
  filterSearchResultsBySources,
  toggleSelectedSource,
} from '@/utils/searchStore'

const SEARCH_HISTORY_LIMIT = 10

type SearchOutcome =
  | { type: 'success' }
  | { type: 'api_error'; response: ApiResponse<SearchResponse> }
  | { type: 'exception'; error: unknown }
  | null

export const useSearchStore = defineStore('search', () => {
  const searchKeyword = ref('')
  const searchResult = ref<SearchResult[]>([])
  const loading = ref(false)
  const hasSearched = ref(false)
  const searchRequestId = ref(0)
  const selectedSources = ref<Set<string>>(new Set())
  const searchHistory = useStorage<string[]>('search-history', [])

  const resultCount = computed(() => searchResult.value.length)

  const availableSources = computed(() => buildAvailableSources(searchResult.value))

  const filteredResults = computed(() =>
    filterSearchResultsBySources(searchResult.value, selectedSources.value)
  )

  function rememberQuery(query: string): void {
    searchHistory.value = appendSearchHistory(
      searchHistory.value,
      query,
      SEARCH_HISTORY_LIMIT
    )
  }

  function toggleSource(source: string): void {
    selectedSources.value = toggleSelectedSource(selectedSources.value, source)
  }

  function clearSourceFilter(): void {
    selectedSources.value = new Set()
  }

  function stopSearch(): void {
    searchRequestId.value += 1
    loading.value = false
  }

  async function search(query?: string): Promise<SearchOutcome> {
    const normalizedQuery = (query || searchKeyword.value).trim()
    const requestId = searchRequestId.value + 1

    searchRequestId.value = requestId
    searchKeyword.value = normalizedQuery
    loading.value = true
    hasSearched.value = true
    rememberQuery(normalizedQuery)

    try {
      const response = await searchApi.searchBooks(normalizedQuery)
      if (requestId !== searchRequestId.value) {
        return null
      }

      if (response.isSuccess) {
        searchResult.value = response.data?.results || []
        return { type: 'success' }
      }

      searchResult.value = []
      return { type: 'api_error', response }
    } catch (error) {
      if (requestId !== searchRequestId.value) {
        return null
      }

      searchResult.value = []
      return { type: 'exception', error }
    } finally {
      if (requestId === searchRequestId.value) {
        loading.value = false
      }
    }
  }

  function clearHistory(): void {
    searchHistory.value = []
  }

  function reset(): void {
    stopSearch()
    hasSearched.value = false
    searchResult.value = []
    searchKeyword.value = ''
    clearSourceFilter()
  }

  return {
    searchKeyword,
    searchResult,
    loading,
    hasSearched,
    searchHistory,
    selectedSources,
    resultCount,
    availableSources,
    filteredResults,
    toggleSource,
    clearSourceFilter,
    stopSearch,
    search,
    clearHistory,
    reset,
  }
})
