import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'
import { searchApi } from '@/api/search'
import type { ApiResponse } from '@/api/http/types'
import type { SearchError, SearchResponse, SearchResult } from '@/types/search'
import {
  appendSearchError,
  appendSearchHistory,
  appendSearchResult,
  buildAvailableSources,
  filterSearchResultsBySources,
  getSearchAggregateKey,
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
  const searchErrors = ref<SearchError[]>([])
  const loading = ref(false)
  const hasSearched = ref(false)
  const searchRequestId = ref(0)
  const selectedSources = ref<Set<string>>(new Set())
  const searchHistory = useStorage<string[]>('search-history', [])
  const preferredSourceMap = useStorage<Record<string, string>>(
    'search-preferred-sources',
    {},
  )
  let searchAbortController: AbortController | null = null

  const filteredResults = computed(() =>
    filterSearchResultsBySources(searchResult.value, selectedSources.value)
  )

  const resultCount = computed(() => filteredResults.value.length)

  const availableSources = computed(() => buildAvailableSources(searchResult.value))

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

  function rememberPreferredSource(
    book: Pick<SearchResult, 'name' | 'author' | 'sourceId'>,
  ): void {
    const aggregateKey = getSearchAggregateKey(book)

    if (preferredSourceMap.value[aggregateKey] === book.sourceId) {
      return
    }

    preferredSourceMap.value = {
      ...preferredSourceMap.value,
      [aggregateKey]: book.sourceId,
    }
  }

  function getPreferredSourceId(
    book: Pick<SearchResult, 'name' | 'author'>,
  ): string | undefined {
    return preferredSourceMap.value[getSearchAggregateKey(book)]
  }

  function stopSearch(): void {
    searchAbortController?.abort()
    searchAbortController = null
    searchRequestId.value += 1
    loading.value = false
  }

  async function search(query?: string): Promise<SearchOutcome> {
    const normalizedQuery = (query || searchKeyword.value).trim()
    const targetSources = Array.from(selectedSources.value)
    const requestId = searchRequestId.value + 1
    const abortController = new AbortController()

    searchAbortController?.abort()
    searchAbortController = abortController
    searchRequestId.value = requestId
    searchKeyword.value = normalizedQuery
    searchResult.value = []
    searchErrors.value = []
    loading.value = true
    hasSearched.value = true
    rememberQuery(normalizedQuery)

    try {
      await searchApi.searchBooksStream(normalizedQuery, targetSources, {
        signal: abortController.signal,
        onResult(result) {
          if (requestId !== searchRequestId.value) {
            return
          }

          searchResult.value = appendSearchResult(searchResult.value, result)
        },
        onError(error) {
          if (requestId !== searchRequestId.value) {
            return
          }

          searchErrors.value = appendSearchError(searchErrors.value, error)
        },
      })

      if (requestId !== searchRequestId.value) {
        return null
      }

      return { type: 'success' }
    } catch (error) {
      if (abortController.signal.aborted || requestId !== searchRequestId.value) {
        return null
      }

      try {
        const response = await searchApi.searchBooks(normalizedQuery, targetSources)
        if (requestId !== searchRequestId.value) {
          return null
        }

        if (response.isSuccess) {
          searchResult.value = response.data?.results || []
          searchErrors.value = response.data?.errors || []
          return { type: 'success' }
        }

        searchResult.value = []
        searchErrors.value = []
        return { type: 'api_error', response }
      } catch (fallbackError) {
        if (abortController.signal.aborted || requestId !== searchRequestId.value) {
          return null
        }

        searchResult.value = []
        searchErrors.value = []
        return { type: 'exception', error: fallbackError }
      }
    } finally {
      if (searchAbortController === abortController) {
        searchAbortController = null
      }

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
    searchErrors.value = []
    searchKeyword.value = ''
    clearSourceFilter()
  }

  return {
    searchKeyword,
    searchResult,
    searchErrors,
    loading,
    hasSearched,
    searchHistory,
    selectedSources,
    resultCount,
    availableSources,
    filteredResults,
    toggleSource,
    clearSourceFilter,
    rememberPreferredSource,
    getPreferredSourceId,
    stopSearch,
    search,
    clearHistory,
    reset,
  }
})
