<script setup lang="ts">
import type { RefineSuggestion } from '@/composables/source-builder/types'

type RefineChange = {
  path: string
  before?: string | null
  after?: string | null
}

type StructuredHintsModel = {
  searchEntry?: string | null
  searchResultSelector?: string | null
  bookTitleSelector?: string | null
  authorSelector?: string | null
  introSelector?: string | null
  tocItemSelector?: string | null
  contentSelector?: string | null
  paginationSelector?: string | null
  noisePatterns: string[]
}

const structuredHints = defineModel<StructuredHintsModel>('structuredHints', { required: true })
const freeTextHints = defineModel<string>('freeTextHints', { required: true })

const props = defineProps<{
  refineSuggestions: RefineSuggestion[]
  refineLoading: boolean
  aiAssistLoading: boolean
  aiAssistSummary: string[]
  aiAssistOpsLeaderboard: Array<{
    sourceId: string
    count: number
    accepted: number
    acceptRate: number
    avgDeltaScore: number
    regressionCount: number
  }>
  aiAssistOpsRegressionTop: Array<{ regression: string; count: number }>
  aiAssistOpsRecommendedActions: Array<{
    actionCode:
      | 'run_validation_with_samples'
      | 'fix_rule_compile_errors'
      | 'repair_search_selectors_or_samples'
      | 'repair_book_title_author_selectors'
      | 'repair_toc_item_selector'
      | 'repair_content_selector_and_noise_rules'
    reason: string
    priority: number
  }>
  hasCurrentPackage: boolean
  refineAutoActions: string[]
  refineAppliedHints: string[]
  refineChanges: RefineChange[]
}>()

const emit = defineEmits<{
  applyRefineSuggestion: [item: RefineSuggestion]
  applyRefineSuggestionAndRefine: [item: RefineSuggestion]
  requestAiAssist: []
  requestAiAssistAndRefine: []
  refineCurrentPackage: []
}>()

function onNoisePatternsInput(event: Event) {
  structuredHints.value.noisePatterns = String((event.target as HTMLInputElement).value)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}
</script>

<template>
  <section class="mb-8 rounded-2xl border border-border/50 bg-card overflow-hidden">
    <div class="p-5 border-b border-border/50 flex items-start justify-between gap-3">
      <div>
        <p class="text-sm font-medium">Refine With Hints</p>
        <p class="text-xs text-muted-foreground mt-1">输入结构化提示或自由文本提示，让 AI 修正规则并重新验证。</p>
      </div>
      <div class="flex items-center gap-2">
        <button
          class="h-8 px-3 rounded-full border bg-background hover:bg-muted text-xs disabled:opacity-50"
          :disabled="props.aiAssistLoading || props.refineLoading || !props.hasCurrentPackage"
          @click="emit('requestAiAssist')"
        >
          {{ props.aiAssistLoading ? '生成中...' : 'Cloudflare AI 建议' }}
        </button>
        <button
          class="h-8 px-3 rounded-full bg-primary text-primary-foreground hover:opacity-90 text-xs disabled:opacity-50"
          :disabled="props.aiAssistLoading || props.refineLoading || !props.hasCurrentPackage"
          @click="emit('requestAiAssistAndRefine')"
        >
          AI 建议并修正
        </button>
      </div>
    </div>
    <div v-if="props.aiAssistSummary.length > 0" class="p-5 border-b border-border/50">
      <p class="text-xs text-muted-foreground mb-2">AI Assist Summary</p>
      <ul class="space-y-1 text-xs break-all">
        <li v-for="item in props.aiAssistSummary" :key="item">{{ item }}</li>
      </ul>
    </div>
    <div
      v-if="
        props.aiAssistOpsLeaderboard.length > 0 ||
        props.aiAssistOpsRegressionTop.length > 0 ||
        props.aiAssistOpsRecommendedActions.length > 0
      "
      class="p-5 border-b border-border/50"
    >
      <p class="text-xs text-muted-foreground mb-3">AI Feedback Ops Insights (14d)</p>
      <div class="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <div v-if="props.aiAssistOpsLeaderboard.length > 0" class="rounded-xl border border-border/50 bg-muted/20 p-3">
          <p class="text-xs text-muted-foreground mb-2">Top Sources</p>
          <ul class="space-y-1 text-[11px] break-all">
            <li v-for="item in props.aiAssistOpsLeaderboard" :key="item.sourceId">
              {{ item.sourceId }} · {{ item.accepted }}/{{ item.count }} ·
              accept={{ Math.round(item.acceptRate * 100) }}% ·
              delta={{ Math.round(item.avgDeltaScore * 100) }} ·
              regressions={{ item.regressionCount }}
            </li>
          </ul>
        </div>
        <div v-if="props.aiAssistOpsRegressionTop.length > 0" class="rounded-xl border border-border/50 bg-muted/20 p-3">
          <p class="text-xs text-muted-foreground mb-2">Top Regressions</p>
          <ul class="space-y-1 text-[11px] break-all">
            <li v-for="item in props.aiAssistOpsRegressionTop" :key="`${item.regression}-${item.count}`">
              {{ item.regression }} · {{ item.count }}
            </li>
          </ul>
        </div>
        <div v-if="props.aiAssistOpsRecommendedActions.length > 0" class="rounded-xl border border-border/50 bg-muted/20 p-3">
          <p class="text-xs text-muted-foreground mb-2">Recommended Actions</p>
          <ul class="space-y-1 text-[11px] break-all">
            <li
              v-for="item in props.aiAssistOpsRecommendedActions"
              :key="`${item.actionCode}-${item.priority}`"
            >
              {{ item.actionCode }} · p={{ item.priority }} · {{ item.reason }}
            </li>
          </ul>
        </div>
      </div>
    </div>
    <div v-if="props.refineSuggestions.length > 0" class="p-5 border-b border-border/50">
      <p class="text-xs text-muted-foreground mb-3">Suggested Fixes</p>
      <div class="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <div
          v-for="item in props.refineSuggestions"
          :key="item.id"
          class="rounded-xl border border-border/50 bg-muted/20 p-4"
        >
          <p class="text-sm font-medium">{{ item.title }}</p>
          <p class="text-[11px] text-muted-foreground mt-1">step={{ item.step }} · type={{ item.kind }}</p>
          <p class="text-xs text-muted-foreground mt-2">{{ item.detail }}</p>
          <div class="mt-3 flex justify-end gap-2">
            <button class="h-8 px-3 rounded-full border bg-background hover:bg-muted text-xs" @click="emit('applyRefineSuggestion', item)">
              {{ item.applyLabel }}
            </button>
            <button
              class="h-8 px-3 rounded-full bg-primary text-primary-foreground hover:opacity-90 text-xs disabled:opacity-50"
              :disabled="props.refineLoading || !props.hasCurrentPackage"
              @click="emit('applyRefineSuggestionAndRefine', item)"
            >
              一键应用并修正
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="p-5 grid grid-cols-1 xl:grid-cols-2 gap-3">
      <input v-model="structuredHints.searchEntry" class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm" placeholder="search entry / path" />
      <input v-model="structuredHints.searchResultSelector" class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm" placeholder="search result selector" />
      <input v-model="structuredHints.bookTitleSelector" class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm" placeholder="book title selector" />
      <input v-model="structuredHints.authorSelector" class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm" placeholder="author selector" />
      <input v-model="structuredHints.introSelector" class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm" placeholder="intro selector" />
      <input v-model="structuredHints.tocItemSelector" class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm" placeholder="toc item selector" />
      <input v-model="structuredHints.contentSelector" class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm" placeholder="content selector" />
      <input v-model="structuredHints.paginationSelector" class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm" placeholder="pagination selector" />
    </div>
    <div class="px-5 pb-5">
      <input
        :value="structuredHints.noisePatterns.join(', ')"
        class="w-full h-10 rounded-xl border border-border/50 bg-background px-3 text-sm"
        placeholder="noise patterns，逗号分隔"
        @input="onNoisePatternsInput"
      />
    </div>
    <div class="px-5 pb-5">
      <textarea
        v-model="freeTextHints"
        class="w-full min-h-32 rounded-xl border border-border/50 bg-background px-4 py-3 text-xs font-mono"
        placeholder="自由文本提示，例如：content selector: #txtcontent"
      />
    </div>
    <div class="px-5 pb-5 flex items-center justify-between gap-3">
      <div class="text-xs text-muted-foreground">
        <span v-if="props.refineAutoActions.length > 0">自动修正: {{ props.refineAutoActions.join(' | ') }}</span>
        <br v-if="props.refineAutoActions.length > 0 && props.refineAppliedHints.length > 0" />
        <span v-if="props.refineAppliedHints.length > 0">已应用: {{ props.refineAppliedHints.join(' | ') }}</span>
      </div>
      <button
        class="h-9 px-4 rounded-full text-sm bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
        :disabled="props.refineLoading || !props.hasCurrentPackage"
        @click="emit('refineCurrentPackage')"
      >
        {{ props.refineLoading ? '修正中...' : '根据提示修正规则' }}
      </button>
    </div>
    <div v-if="props.refineChanges.length > 0" class="px-5 pb-5">
      <div class="rounded-xl border border-border/50 bg-muted/20 p-4">
        <p class="text-xs text-muted-foreground mb-3">Refine Diff</p>
        <div class="space-y-3">
          <div v-for="change in props.refineChanges" :key="change.path" class="rounded-lg border border-border/40 bg-background p-3">
            <p class="text-xs font-medium break-all">{{ change.path }}</p>
            <p class="text-[11px] text-muted-foreground mt-2">before</p>
            <pre class="mt-1 overflow-auto rounded-md bg-muted/40 p-2 text-[11px] whitespace-pre-wrap break-all">{{ change.before || '--' }}</pre>
            <p class="text-[11px] text-muted-foreground mt-2">after</p>
            <pre class="mt-1 overflow-auto rounded-md bg-muted/40 p-2 text-[11px] whitespace-pre-wrap break-all">{{ change.after || '--' }}</pre>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
