<script setup lang="ts">
import type { SearchResult } from "@/types/search";
import SearchQueryBar from "./SearchQueryBar.vue";
import SearchResultsEmptyState from "./SearchResultsEmptyState.vue";
import SearchResultsHeader from "./SearchResultsHeader.vue";
import SearchResultsLoadingGrid from "./SearchResultsLoadingGrid.vue";
import SearchResultCard from "./SearchResultCard.vue";
import SearchSourceFilters from "./SearchSourceFilters.vue";

defineProps<{
  searchKeyword: string;
  loading: boolean;
  resultCount: number;
  showSourceFilters: boolean;
  availableSources: string[];
  selectedSources: Set<string>;
  filteredResults: SearchResult[];
  searchResultCount: number;
  hasSearched: boolean;
  openingBook: string | null;
  hasBookOnShelf: (bookUrl: string) => boolean;
}>();

const emit = defineEmits<{
  (e: "update:searchKeyword", value: string): void;
  (e: "search"): void;
  (e: "stopSearch"): void;
  (e: "toggleSource", source: string): void;
  (e: "clearSourceFilter"): void;
  (e: "addToShelf", book: SearchResult): void;
  (e: "openBook", book: SearchResult): void;
  (e: "resetSearch"): void;
  (e: "goBack"): void;
}>();
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
      @stop-search="emit('stopSearch')"
    />

    <SearchSourceFilters
      v-if="showSourceFilters"
      :available-sources="availableSources"
      :selected-sources="selectedSources"
      @toggle-source="emit('toggleSource', $event)"
      @clear="emit('clearSourceFilter')"
    />

    <div
      v-if="filteredResults.length > 0"
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-20"
    >
      <SearchResultCard
        v-for="(book, index) in filteredResults"
        :key="book.bookUrl + index"
        :book="book"
        :opening-book="openingBook"
        :is-on-shelf="hasBookOnShelf(book.bookUrl)"
        @open="emit('openBook', $event)"
        @add-to-shelf="emit('addToShelf', $event)"
      />
    </div>

    <SearchResultsLoadingGrid
      v-if="loading && searchResultCount === 0"
    />

    <SearchResultsEmptyState
      v-if="!loading && searchResultCount === 0 && hasSearched"
      @reset-search="emit('resetSearch')"
      @go-back="emit('goBack')"
    />
  </main>
</template>
