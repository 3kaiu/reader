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

export function useSearchView() {
  const router = useRouter()
  const { success, warning, error: showError } = useMessage()
  const { handleApiError, handlePromiseError } = useErrorHandler()
  const libraryStore = useLibraryStore()
  const searchStore = useSearchStore()
  const { bookUrls } = storeToRefs(libraryStore)
  const {
    searchKeyword,
    searchResult,
    loading,
    hasSearched,
    searchHistory,
    selectedSources,
    resultCount,
    availableSources,
    filteredResults,
  } = storeToRefs(searchStore)
  const hasResults = computed(() => filteredResults.value.length > 0)
  const showHeroState = computed(
    () => !hasSearched.value && !loading.value && searchResult.value.length === 0
  )
  const showSourceFilters = computed(
    () => availableSources.value.length > 1 && !loading.value
  )
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
    bookUrls,
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
  })

  return {
    searchKeyword,
    searchResult,
    loading,
    hasSearched,
    hasResults,
    showHeroState,
    showSourceFilters,
    searchHistory,
    selectedSources,
    resultCount,
    availableSources,
    filteredResults,
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
