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
import {
  aggregateSearchResults,
  createSearchResultComparator,
  decorateSearchErrors,
} from '@/stores/search/helpers'

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
    searchStageReports,
    searchRequestIdHeader,
    loading,
    hasSearched,
    searchHistory,
    selectedSources,
    availableSources,
    filteredResults,
  } = storeToRefs(searchStore)

  // ── 源查找表 ──────────────────────────────────────────

  const sourceById = computed(
    () => new Map(sources.value.map(source => [source.id, source] as const))
  )

  const sourceNameMap = computed(() => {
    const entries = sources.value.map(source => [source.id, source.name] as const)
    return new Map<string, string>(entries)
  })

  // ── 合并可用源（来自本地 + 搜索结果） ─────────────────

  const mergedAvailableSources = computed(() => {
    const sourceMap = new Map<string, { id: string; name: string }>()

    sources.value.forEach(source => {
      if (source.enabled !== false) {
        sourceMap.set(source.id, { id: source.id, name: source.name })
      }
    })

    availableSources.value.forEach(source => {
      if (!sourceMap.has(source.id)) {
        sourceMap.set(source.id, source)
      }
    })

    const sourceOrderMap = new Map(
      sources.value.map((source, index) => [source.id, index] as const)
    )

    return Array.from(sourceMap.values()).sort((left, right) => {
      const leftOrder = sourceOrderMap.get(left.id)
      const rightOrder = sourceOrderMap.get(right.id)

      if (typeof leftOrder === 'number' && typeof rightOrder === 'number') {
        return leftOrder - rightOrder
      }
      if (typeof leftOrder === 'number') return -1
      if (typeof rightOrder === 'number') return 1

      return left.name.localeCompare(right.name, 'zh-CN')
    })
  })

  // ── 排序比较器 ────────────────────────────────────────

  const searchResultComparator = computed(
    () => createSearchResultComparator({
      getPreferredSourceId: (book) => searchStore.getPreferredSourceId(book),
      sourceById: sourceById.value,
    })
  )

  // ── 视图计算属性 ──────────────────────────────────────

  const searchErrorItems = computed(() =>
    decorateSearchErrors(searchErrors.value, sourceNameMap.value)
  )

  const aggregatedFilteredResults = computed(() =>
    aggregateSearchResults(filteredResults.value, searchResultComparator.value).sort(
      (left, right) => {
        const compare = searchResultComparator.value(left, right)

        if (compare !== 0) {
          return compare
        }

        if (left.sourceCount !== right.sourceCount) {
          return right.sourceCount - left.sourceCount
        }

        return left.name.localeCompare(right.name, 'zh-CN')
      }
    )
  )

  const displayResultCount = computed(() => aggregatedFilteredResults.value.length)
  const hasResults = computed(() => aggregatedFilteredResults.value.length > 0)
  const showHeroState = computed(
    () => !hasSearched.value && !loading.value && searchResult.value.length === 0
  )
  const showSourceFilters = computed(() => mergedAvailableSources.value.length > 1)

  // ── 操作 ──────────────────────────────────────────────

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
    searchStageReports,
    searchRequestIdHeader,
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