<script setup lang="ts">
interface SearchRunResultItem {
  name?: string
  author?: string
  sourceName?: string
  bookUrl?: string
}

interface ChapterRunResultItem {
  title?: string
  url?: string
}

const runSearchQuery = defineModel<string>('runSearchQuery', { required: true })
const runTargetUrl = defineModel<string>('runTargetUrl', { required: true })

const props = defineProps<{
  runLoading: boolean
  hasCurrentPackage: boolean
  runExecutionProfileSummary: string[]
  runResult: unknown
  runSummary: string[]
  runSearchResultItems: SearchRunResultItem[]
  runSuggestedActions: string[]
  runSearchDetailResult: unknown
  runSearchDetailSummary: string[]
  runSearchDetailSuggestedActions: string[]
  runChaptersResult: unknown
  runChaptersSummary: string[]
  runChapterResultItems: ChapterRunResultItem[]
  runChaptersSuggestedActions: string[]
}>()

const emit = defineEmits<{
  runOperation: [operation: 'search' | 'book_info' | 'chapters' | 'content']
  runSearchAndValidateDetail: []
  runDetailValidation: [bookUrl: string]
  runDetailAndChaptersValidation: [bookUrl: string]
}>()
</script>

<template>
  <section class="mb-8 rounded-2xl border border-border/50 bg-card overflow-hidden">
    <div class="p-5 border-b border-border/50">
      <p class="text-sm font-medium">Run By Package</p>
      <p class="text-xs text-muted-foreground mt-1">
        对当前预览包直接执行 search / book / chapters / content，优先用于验证搜索候选规则是否真的可跑。
      </p>
    </div>
    <div class="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
      <input
        v-model="runSearchQuery"
        class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm"
        placeholder="search query"
      />
      <input
        v-model="runTargetUrl"
        class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm"
        placeholder="target url"
      />
    </div>
    <div class="px-5 pb-5 flex flex-wrap gap-2">
      <button
        class="h-9 px-4 rounded-full border bg-background hover:bg-muted text-sm disabled:opacity-50"
        :disabled="props.runLoading || !props.hasCurrentPackage || !runSearchQuery.trim()"
        @click="emit('runOperation', 'search')"
      >
        Run Search
      </button>
      <button
        class="h-9 px-4 rounded-full border bg-background hover:bg-muted text-sm disabled:opacity-50"
        :disabled="props.runLoading || !props.hasCurrentPackage || !runSearchQuery.trim()"
        @click="emit('runSearchAndValidateDetail')"
      >
        Search -> Detail
      </button>
      <button
        class="h-9 px-4 rounded-full border bg-background hover:bg-muted text-sm disabled:opacity-50"
        :disabled="props.runLoading || !props.hasCurrentPackage || !runTargetUrl.trim()"
        @click="emit('runOperation', 'book_info')"
      >
        Run Book Info
      </button>
      <button
        class="h-9 px-4 rounded-full border bg-background hover:bg-muted text-sm disabled:opacity-50"
        :disabled="props.runLoading || !props.hasCurrentPackage || !runTargetUrl.trim()"
        @click="emit('runOperation', 'chapters')"
      >
        Run Chapters
      </button>
      <button
        class="h-9 px-4 rounded-full border bg-background hover:bg-muted text-sm disabled:opacity-50"
        :disabled="props.runLoading || !props.hasCurrentPackage || !runTargetUrl.trim()"
        @click="emit('runOperation', 'content')"
      >
        Run Content
      </button>
    </div>
    <div v-if="props.runExecutionProfileSummary.length > 0" class="px-5 pb-5">
      <div class="rounded-xl border border-border/50 bg-muted/20 p-4">
        <p class="text-xs text-muted-foreground mb-2">Execution Profile</p>
        <ul class="space-y-1 text-xs break-all">
          <li v-for="item in props.runExecutionProfileSummary" :key="item">{{ item }}</li>
        </ul>
      </div>
    </div>
    <div v-if="props.runResult" class="px-5 pb-5 space-y-4">
      <div v-if="props.runSummary.length > 0" class="rounded-xl border border-border/50 bg-muted/20 p-4">
        <p class="text-xs text-muted-foreground mb-2">Run Summary</p>
        <ul class="space-y-1 text-xs break-all">
          <li v-for="item in props.runSummary" :key="item">{{ item }}</li>
        </ul>
      </div>
      <div
        v-if="props.runSearchResultItems.length > 0"
        class="rounded-xl border border-border/50 bg-muted/20 p-4"
      >
        <p class="text-xs text-muted-foreground mb-2">Search Candidates</p>
        <div class="space-y-3">
          <div
            v-for="(item, index) in props.runSearchResultItems.slice(0, 8)"
            :key="`${item.bookUrl || item.name || 'candidate'}-${index}`"
            class="rounded-lg border border-border/40 bg-background p-3"
          >
            <p class="text-sm font-medium break-all">{{ item.name || '--' }}</p>
            <p class="mt-1 text-xs text-muted-foreground break-all">
              {{ item.author || '未知作者' }}
              <span v-if="item.sourceName"> · {{ item.sourceName }}</span>
            </p>
            <p v-if="item.bookUrl" class="mt-2 text-[11px] text-muted-foreground break-all">
              {{ item.bookUrl }}
            </p>
            <div class="mt-3 flex justify-end">
              <button
                class="h-8 px-3 rounded-full border bg-background hover:bg-muted text-xs disabled:opacity-50 mr-2"
                :disabled="props.runLoading || !item.bookUrl"
                @click="emit('runDetailAndChaptersValidation', item.bookUrl || '')"
              >
                验证目录
              </button>
              <button
                class="h-8 px-3 rounded-full border bg-background hover:bg-muted text-xs disabled:opacity-50"
                :disabled="props.runLoading || !item.bookUrl"
                @click="emit('runDetailValidation', item.bookUrl || '')"
              >
                验证详情页
              </button>
            </div>
          </div>
        </div>
      </div>
      <div
        v-if="props.runSuggestedActions.length > 0"
        class="rounded-xl border border-amber-400/40 bg-amber-500/5 p-4"
      >
        <p class="text-xs text-amber-700 dark:text-amber-300 mb-2">Suggested Actions</p>
        <ul class="space-y-1 text-xs break-all text-amber-800 dark:text-amber-200">
          <li v-for="item in props.runSuggestedActions" :key="item">{{ item }}</li>
        </ul>
      </div>
      <div
        v-if="props.runSearchDetailResult"
        class="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-3"
      >
        <div v-if="props.runSearchDetailSummary.length > 0">
          <p class="text-xs text-muted-foreground mb-2">Detail Validation</p>
          <ul class="space-y-1 text-xs break-all">
            <li v-for="item in props.runSearchDetailSummary" :key="item">{{ item }}</li>
          </ul>
        </div>
        <div
          v-if="props.runSearchDetailSuggestedActions.length > 0"
          class="rounded-lg border border-amber-400/40 bg-amber-500/5 p-3"
        >
          <p class="text-xs text-amber-700 dark:text-amber-300 mb-2">Detail Suggested Actions</p>
          <ul class="space-y-1 text-xs break-all text-amber-800 dark:text-amber-200">
            <li v-for="item in props.runSearchDetailSuggestedActions" :key="item">{{ item }}</li>
          </ul>
        </div>
        <pre class="w-full overflow-auto rounded-xl border border-border/50 bg-background p-4 text-xs">{{ JSON.stringify(props.runSearchDetailResult, null, 2) }}</pre>
      </div>
      <div
        v-if="props.runChaptersResult"
        class="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-3"
      >
        <div v-if="props.runChaptersSummary.length > 0">
          <p class="text-xs text-muted-foreground mb-2">Chapter Validation</p>
          <ul class="space-y-1 text-xs break-all">
            <li v-for="item in props.runChaptersSummary" :key="item">{{ item }}</li>
          </ul>
        </div>
        <div
          v-if="props.runChapterResultItems.length > 0"
          class="rounded-lg border border-border/40 bg-background p-3"
        >
          <p class="text-xs text-muted-foreground mb-2">Chapter Candidates</p>
          <div class="space-y-2">
            <div
              v-for="(item, index) in props.runChapterResultItems.slice(0, 10)"
              :key="`${item.url || item.title || 'chapter'}-${index}`"
              class="rounded-md border border-border/30 bg-muted/20 p-2"
            >
              <p class="text-xs font-medium break-all">{{ item.title || '--' }}</p>
              <p v-if="item.url" class="mt-1 text-[11px] text-muted-foreground break-all">
                {{ item.url }}
              </p>
            </div>
          </div>
        </div>
        <div
          v-if="props.runChaptersSuggestedActions.length > 0"
          class="rounded-lg border border-amber-400/40 bg-amber-500/5 p-3"
        >
          <p class="text-xs text-amber-700 dark:text-amber-300 mb-2">Chapter Suggested Actions</p>
          <ul class="space-y-1 text-xs break-all text-amber-800 dark:text-amber-200">
            <li v-for="item in props.runChaptersSuggestedActions" :key="item">{{ item }}</li>
          </ul>
        </div>
        <pre class="w-full overflow-auto rounded-xl border border-border/50 bg-background p-4 text-xs">{{ JSON.stringify(props.runChaptersResult, null, 2) }}</pre>
      </div>
      <pre class="w-full overflow-auto rounded-xl border border-border/50 bg-background p-4 text-xs">{{ JSON.stringify(props.runResult, null, 2) }}</pre>
    </div>
  </section>
</template>
