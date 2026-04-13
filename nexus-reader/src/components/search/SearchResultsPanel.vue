<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PipelineStageReport } from '@/types/pipeline'
import type {
  SearchDisplayResult,
  SearchResultActionPayload,
  SearchSourceOption,
  SearchResult,
} from '@/types/search'
import { getSearchAggregateKey } from '@/utils/searchStore'
import { Button } from '@/components/ui/button'
import SearchQueryBar from './SearchQueryBar.vue'
import SearchErrorPanel from './SearchErrorPanel.vue'
import SearchResultsEmptyState from './SearchResultsEmptyState.vue'
import SearchResultsHeader from './SearchResultsHeader.vue'
import SearchResultsLoadingGrid from './SearchResultsLoadingGrid.vue'
import SearchResultCard from './SearchResultCard.vue'
import SearchSourceFilters from './SearchSourceFilters.vue'

const props = defineProps<{
  searchKeyword: string
  loading: boolean
  resultCount: number
  searchRequestId?: string | null
  searchStageReports?: PipelineStageReport[]
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

const diagnosticsOpen = ref(false)

const searchStageSummary = computed(() => {
  const reports = props.searchStageReports || []
  const report =
    reports.find(r => r.stage === 'search_stream') ||
    reports.find(r => r.stage === 'search') ||
    reports[0]
  const metrics = report?.metrics || {}
  return {
    stage: report?.stage || '--',
    elapsedMs: metrics.elapsedMs || '--',
    total: metrics.total || '--',
    sourcesRequested: metrics.sourcesRequested || '--',
  }
})

const packageIdSummary = computed(() => {
  const variants = props.filteredResults.flatMap(item => item.sourceVariants || [])
  const ids = variants.map(v => v.packageId).filter((id): id is string => typeof id === 'string' && id.length > 0)
  const unique = Array.from(new Set(ids))
  return {
    unique,
    count: unique.length,
  }
})

async function copyRequestId() {
  const value = props.searchRequestId || ''
  if (!value) return
  try {
    await navigator.clipboard.writeText(value)
  } catch {
    // ignore clipboard failures
  }
}

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

    <details
      v-if="searchRequestId || (searchStageReports && searchStageReports.length > 0)"
      class="mb-4 rounded-xl border bg-muted/10 px-4 py-3"
      :open="diagnosticsOpen"
      @toggle="diagnosticsOpen = (($event.target as HTMLDetailsElement)?.open ?? false)"
    >
      <summary class="cursor-pointer select-none text-xs font-medium text-muted-foreground">
        诊断信息
        <span v-if="searchStageSummary.elapsedMs !== '--'" class="ml-2">
          ({{ searchStageSummary.elapsedMs }}ms · total={{ searchStageSummary.total }})
        </span>
      </summary>

      <div class="mt-3 space-y-2 text-xs">
        <div v-if="searchRequestId" class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="text-muted-foreground">X-Request-ID</div>
            <div class="font-mono truncate">{{ searchRequestId }}</div>
          </div>
          <Button variant="outline" size="sm" class="h-7 px-3 text-xs" @click="copyRequestId">
            复制
          </Button>
        </div>

        <div v-if="packageIdSummary.count > 0" class="rounded-md border bg-background/40 px-2 py-1">
          <div class="text-muted-foreground">active packageIds (unique)</div>
          <div class="font-mono break-all">
            {{ packageIdSummary.unique.join(', ') }}
          </div>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div class="rounded-md border bg-background/40 px-2 py-1">
            <div class="text-muted-foreground">stage</div>
            <div class="font-mono">{{ searchStageSummary.stage }}</div>
          </div>
          <div class="rounded-md border bg-background/40 px-2 py-1">
            <div class="text-muted-foreground">elapsedMs</div>
            <div class="font-mono">{{ searchStageSummary.elapsedMs }}</div>
          </div>
          <div class="rounded-md border bg-background/40 px-2 py-1">
            <div class="text-muted-foreground">total</div>
            <div class="font-mono">{{ searchStageSummary.total }}</div>
          </div>
          <div class="rounded-md border bg-background/40 px-2 py-1">
            <div class="text-muted-foreground">sourcesRequested</div>
            <div class="font-mono">{{ searchStageSummary.sourcesRequested }}</div>
          </div>
        </div>

        <pre
          v-if="searchStageReports && searchStageReports.length > 0"
          class="max-h-48 overflow-auto rounded-md border bg-background/40 p-2 text-[11px] leading-snug"
        >{{ JSON.stringify(searchStageReports, null, 2) }}</pre>
      </div>
    </details>

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
