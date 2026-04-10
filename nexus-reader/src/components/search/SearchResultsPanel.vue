<script setup lang="ts">
import type {
  SearchDisplayResult,
  SearchResultActionPayload,
  SearchSourceOption,
  SearchResult,
} from '@/types/search'
import { getSearchAggregateKey } from '@/utils/searchStore'
import SearchQueryBar from './SearchQueryBar.vue'
import SearchErrorPanel from './SearchErrorPanel.vue'
import SearchResultsEmptyState from './SearchResultsEmptyState.vue'
import SearchResultsHeader from './SearchResultsHeader.vue'
import SearchResultsLoadingGrid from './SearchResultsLoadingGrid.vue'
import SearchResultCard from './SearchResultCard.vue'
import SearchSourceFilters from './SearchSourceFilters.vue'

defineProps<{
  searchKeyword: string
  loading: boolean
  resultCount: number
  showSourceFilters: boolean
  availableSources: SearchSourceOption[]
  selectedSources: Set<string>
  searchErrors: Array<{
    sourceId: string
    sourceName: string
    error: string
  }>
  filteredResults: SearchDisplayResult[]
  searchResultCount: number
  hasSearched: boolean
  openingBook: string | null
  hasBookOnShelf: (book: SearchResult) => boolean
}>()

const emit = defineEmits<{
  (e: 'update:searchKeyword', value: string): void
  (e: 'search'): void
  (e: 'stopSearch'): void
  (e: 'toggleSource', source: string): void
  (e: 'clearSourceFilter'): void
  (e: 'addToShelf', payload: SearchResultActionPayload): void
  (e: 'openBook', payload: SearchResultActionPayload): void
  (e: 'resetSearch'): void
  (e: 'goBack'): void
}>()
</script>

<template>
  <main
    class="max-w-7xl mx-auto px-5 sm:px-6 pt-20 sm:pt-24 animate-in fade-in slide-in-from-bottom-4 duration-500"
  >
    <div
      class="sticky top-4 z-30 mb-6 flex justify-center animate-in fade-in slide-in-from-top-2 duration-300"
    >
      <div class="w-full max-w-2xl">
        <SearchQueryBar
          variant="results"
          :model-value="searchKeyword"
          @update:model-value="emit('update:searchKeyword', $event)"
          @search="emit('search')"
        />
      </div>
    </div>

    <SearchResultsHeader
      :loading="loading"
      :result-count="resultCount"
      :error-count="searchErrors.length"
      @stop-search="emit('stopSearch')"
    />

    <SearchSourceFilters
      v-if="showSourceFilters"
      :available-sources="availableSources"
      :selected-sources="selectedSources"
      :disabled="loading"
      @toggle-source="emit('toggleSource', $event)"
      @clear="emit('clearSourceFilter')"
    />

    <SearchErrorPanel :errors="searchErrors" />

    <div
      v-if="filteredResults.length > 0"
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-20"
    >
      <SearchResultCard
        v-for="book in filteredResults"
        :key="getSearchAggregateKey(book)"
        :book="book"
        :opening-book="openingBook"
        :has-book-on-shelf="hasBookOnShelf"
        @open="emit('openBook', $event)"
        @add-to-shelf="emit('addToShelf', $event)"
      />
    </div>

    <SearchResultsLoadingGrid v-if="loading && searchResultCount === 0" />

    <SearchResultsEmptyState
      v-if="!loading && searchResultCount === 0 && hasSearched"
      @reset-search="emit('resetSearch')"
      @go-back="emit('goBack')"
    />
  </main>
</template>
