import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import type { ApiResponse } from '@/api/http/types'
import { useSearchActions } from '@/composables/useSearchActions'
import { useErrorHandler } from '@/composables/useErrorHandler'
import { useMessage } from '@/composables/useMessage'
import { useSearchSession } from '@/composables/useSearchSession'
import { useLibraryStore } from '@/stores/library'
import { useSearchStore } from '@/stores/search'
import { useSourceStore } from '@/stores/source'
import type { SearchDisplayResult, SearchResult, SearchSourceOption } from '@/types/search'
import { aggregateSearchResults, getSearchAggregateKey } from '@/utils/searchStore'
import {
  compareSourcesByBusinessPriority,
} from '@/utils/sourceStore'

export function useSearchView() {
  const router = useRouter()
  const { success, warning, error: showError } = useMessage()
  const { handleApiError, handlePromiseError } = useErrorHandler()
  const libraryStore = useLibraryStore()
  const searchStore = useSearchStore()
  const sourceStore = useSourceStore()
  const { books } = storeToRefs(libraryStore)
  const { sources } = storeToRefs(sourceStore)
  const {
    searchKeyword,
    searchResult,
    searchErrors,
    loading,
    hasSearched,
    searchHistory,
    selectedSources,
    availableSources,
    filteredResults,
  } = storeToRefs(searchStore)
  const sourceCatalogOptions = computed<SearchSourceOption[]>(() =>
    sources.value
      .filter(source => source.enabled !== false && source.publicAccessEnabled === true)
      .map(source => ({
        id: source.id,
        name: source.name,
      }))
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
  )
  const mergedAvailableSources = computed<SearchSourceOption[]>(() => {
    const sourceMap = new Map<string, SearchSourceOption>()

    sourceCatalogOptions.value.forEach(source => {
      sourceMap.set(source.id, source)
    })

    availableSources.value.forEach(source => {
      if (!sourceMap.has(source.id)) {
        sourceMap.set(source.id, source)
      }
    })

    const sourceOrderMap = new Map(
      sources.value.map((source, index) => [source.id, index] as const),
    )

    return Array.from(sourceMap.values()).sort((left, right) => {
      const leftOrder = sourceOrderMap.get(left.id)
      const rightOrder = sourceOrderMap.get(right.id)

      if (typeof leftOrder === 'number' && typeof rightOrder === 'number') {
        return leftOrder - rightOrder
      }

      if (typeof leftOrder === 'number') {
        return -1
      }

      if (typeof rightOrder === 'number') {
        return 1
      }

      return left.name.localeCompare(right.name, 'zh-CN')
    })
  })
  const sourceNameMap = computed(() => {
    const entries = sources.value.map(source => [source.id, source.name] as const)
    return new Map<string, string>(entries)
  })
  const sourceById = computed(
    () => new Map(sources.value.map(source => [source.id, source] as const)),
  )
  const searchErrorItems = computed(() =>
    searchErrors.value.map(error => ({
      ...error,
      sourceName: sourceNameMap.value.get(error.sourceId) || error.sourceId,
    })),
  )
  const compareSearchResultsBySourcePriority = (left: SearchResult, right: SearchResult) => {
    const leftAggregateKey = getSearchAggregateKey(left)
    const rightAggregateKey = getSearchAggregateKey(right)

    if (leftAggregateKey === rightAggregateKey) {
      const preferredSourceId = searchStore.getPreferredSourceId(left)
      const leftPreferred = preferredSourceId === left.sourceId
      const rightPreferred = preferredSourceId === right.sourceId

      if (leftPreferred !== rightPreferred) {
        return leftPreferred ? -1 : 1
      }
    }

    const leftSource = sourceById.value.get(left.sourceId)
    const rightSource = sourceById.value.get(right.sourceId)

    return compareSourcesByBusinessPriority(
      leftSource || { id: left.sourceId, name: left.sourceName, enabled: true },
      rightSource || { id: right.sourceId, name: right.sourceName, enabled: true },
    )
  }

  const aggregatedFilteredResults = computed<SearchDisplayResult[]>(() =>
    aggregateSearchResults(filteredResults.value, compareSearchResultsBySourcePriority).sort(
      (left, right) => {
        const compare = compareSearchResultsBySourcePriority(left, right)

        if (compare !== 0) {
          return compare
        }

        if (left.sourceCount !== right.sourceCount) {
          return right.sourceCount - left.sourceCount
        }

        return left.name.localeCompare(right.name, 'zh-CN')
      },
    ),
  )
  const displayResultCount = computed(() => aggregatedFilteredResults.value.length)
  const hasResults = computed(() => aggregatedFilteredResults.value.length > 0)
  const showHeroState = computed(
    () => !hasSearched.value && !loading.value && searchResult.value.length === 0
  )
  const showSourceFilters = computed(() => mergedAvailableSources.value.length > 1)
  const {
    openingBook,
    hasBookOnShelf,
    stopSearch,
    search,
    addToShelf,
    openBook,
    clearHistory,
    toggleSource,
    clearSourceFilter,
    resetSearch,
  } = useSearchActions({
    searchKeyword,
    books,
    libraryStore,
    searchStore,
    warning,
    success,
    showError,
    handleApiError: handleApiError as (
      response: ApiResponse<unknown>,
      fallbackMessage?: string
    ) => void,
    handlePromiseError,
  })

  function goBack() {
    void router.push('/')
  }

  useSearchSession({
    searchStore,
    libraryStore,
    sourceStore,
  })

  return {
    searchKeyword,
    searchResult,
    searchErrors: searchErrorItems,
    loading,
    hasSearched,
    hasResults,
    showHeroState,
    showSourceFilters,
    searchHistory,
    selectedSources,
    resultCount: displayResultCount,
    availableSources: mergedAvailableSources,
    filteredResults: aggregatedFilteredResults,
    openingBook,
    hasBookOnShelf,
    stopSearch,
    search,
    addToShelf,
    openBook,
    clearHistory,
    toggleSource,
    clearSourceFilter,
    goBack,
    resetSearch,
  }
}
