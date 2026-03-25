<script setup lang="ts">
/**
 * 搜索页面 - 上一版搜索组件在内容区，顶部保留搜索按钮
 */
import { useSearchView } from '@/composables/useSearchView'
import SearchHeroState from '@/components/search/SearchHeroState.vue'
import SearchResultsPanel from '@/components/search/SearchResultsPanel.vue'

const {
  searchKeyword,
  searchResult,
  loading,
  hasSearched,
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
} = useSearchView()
</script>

<template>
  <div class="min-h-screen bg-background text-foreground pb-24 selection:bg-primary/20">
    <div class="h-safe-top" />

    <SearchHeroState
      v-if="showHeroState"
      v-model:search-keyword="searchKeyword"
      :search-history="searchHistory"
      :loading="loading"
      @search="search"
      @clear-history="clearHistory"
      @go-back="goBack"
      @stop-search="stopSearch"
    />

    <SearchResultsPanel
      v-else
      v-model:search-keyword="searchKeyword"
      :loading="loading"
      :result-count="resultCount"
      :show-source-filters="showSourceFilters"
      :available-sources="availableSources"
      :selected-sources="selectedSources"
      :filtered-results="filteredResults"
      :search-result-count="searchResult.length"
      :has-searched="hasSearched"
      :opening-book="openingBook"
      :has-book-on-shelf="hasBookOnShelf"
      @search="search"
      @stop-search="stopSearch"
      @toggle-source="toggleSource"
      @clear-source-filter="clearSourceFilter"
      @add-to-shelf="addToShelf"
      @open-book="openBook"
      @reset-search="resetSearch"
      @go-back="goBack"
    />
  </div>
</template>

<style scoped>
.h-safe-top {
  height: env(safe-area-inset-top, 0px);
}
</style>
