<script setup lang="ts">
type FetchPreview = {
  html: string
}

const fetchSessionKey = defineModel<string>('fetchSessionKey', { required: true })
const sessionLabel = defineModel<string>('sessionLabel', { required: true })
const sessionTtlSeconds = defineModel<number | string>('sessionTtlSeconds', { required: true })
const sessionCookiesText = defineModel<string>('sessionCookiesText', { required: true })
const sessionHeadersText = defineModel<string>('sessionHeadersText', { required: true })
const fetchHtmlUrl = defineModel<string>('fetchHtmlUrl', { required: true })
const fetchHtmlMethod = defineModel<string>('fetchHtmlMethod', { required: true })
const fetchHtmlBody = defineModel<string>('fetchHtmlBody', { required: true })
const fetchHtmlForceRefresh = defineModel<boolean>('fetchHtmlForceRefresh', { required: true })
const fetchHtmlViewMode = defineModel<'jina' | 'raw' | 'compare'>('fetchHtmlViewMode', {
  required: true,
})

const props = defineProps<{
  sessionLoading: boolean
  fetchHtmlLoading: boolean
  fetchSessionSummary: string[]
  fetchHtmlPreviewSummary: string[]
  rawFetchHtmlPreviewSummary: string[]
  fetchHtmlCompareSummary: string[]
  fetchHtmlError: string
  fetchHtmlPreview: FetchPreview | null
  rawFetchHtmlPreview: FetchPreview | null
}>()

const emit = defineEmits<{
  loadFetchSession: []
  importFetchSession: []
  previewFetchHtml: []
}>()
</script>

<template>
  <section class="mb-8 rounded-2xl border border-border/50 bg-card overflow-hidden">
    <div class="p-5 border-b border-border/50">
      <p class="text-sm font-medium">Human Session</p>
      <p class="text-xs text-muted-foreground mt-1">
        人工过一次站点后，把 cookies / headers 导入这里，后续构建和 HTML 预抓取都复用这个 session。
      </p>
    </div>
    <div class="p-5 grid grid-cols-1 md:grid-cols-3 gap-3">
      <input
        v-model="fetchSessionKey"
        class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm"
        placeholder="session key"
      />
      <input
        v-model="sessionLabel"
        class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm"
        placeholder="label，可选"
      />
      <input
        v-model="sessionTtlSeconds"
        type="number"
        min="60"
        class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm"
        placeholder="ttl seconds"
      />
    </div>
    <div class="px-5 pb-5 grid grid-cols-1 xl:grid-cols-2 gap-4">
      <textarea
        v-model="sessionCookiesText"
        class="w-full min-h-32 rounded-xl border border-border/50 bg-background px-4 py-3 text-xs font-mono"
        placeholder="cookies，支持 a=b; c=d 或多行"
      />
      <textarea
        v-model="sessionHeadersText"
        class="w-full min-h-32 rounded-xl border border-border/50 bg-background px-4 py-3 text-xs font-mono"
        placeholder="headers，支持 JSON 或多行 Header: Value"
      />
    </div>
    <div class="px-5 pb-5 grid grid-cols-1 md:grid-cols-[1.2fr_1fr_1fr_auto] gap-3">
      <input
        v-model="fetchHtmlUrl"
        class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm"
        placeholder="HTML preview url"
      />
      <input
        v-model="fetchHtmlMethod"
        class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm"
        placeholder="GET / POST"
      />
      <label
        class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm flex items-center gap-2"
      >
        <input v-model="fetchHtmlForceRefresh" type="checkbox" />
        force refresh
      </label>
      <div class="flex justify-end gap-2">
        <button
          class="h-9 px-4 rounded-full border bg-background hover:bg-muted text-sm disabled:opacity-50"
          :disabled="props.sessionLoading || !fetchSessionKey.trim()"
          @click="emit('loadFetchSession')"
        >
          {{ props.sessionLoading ? '处理中...' : '检查 Session' }}
        </button>
        <button
          class="h-9 px-4 rounded-full border bg-background hover:bg-muted text-sm disabled:opacity-50"
          :disabled="props.sessionLoading || !fetchSessionKey.trim()"
          @click="emit('importFetchSession')"
        >
          {{ props.sessionLoading ? '处理中...' : '导入 Session' }}
        </button>
        <button
          class="h-9 px-4 rounded-full text-sm bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
          :disabled="props.fetchHtmlLoading || !fetchHtmlUrl.trim()"
          @click="emit('previewFetchHtml')"
        >
          {{ props.fetchHtmlLoading ? '抓取中...' : '预抓取 HTML' }}
        </button>
      </div>
    </div>
    <div v-if="fetchHtmlMethod.trim().toUpperCase() !== 'GET'" class="px-5 pb-5">
      <textarea
        v-model="fetchHtmlBody"
        class="w-full min-h-24 rounded-xl border border-border/50 bg-background px-4 py-3 text-xs font-mono"
        placeholder="fetch body，可选"
      />
    </div>
    <div
      v-if="
        props.fetchSessionSummary.length > 0 ||
        props.fetchHtmlPreviewSummary.length > 0 ||
        props.rawFetchHtmlPreviewSummary.length > 0
      "
      class="px-5 pb-5 grid grid-cols-1 xl:grid-cols-2 gap-3"
    >
      <div
        v-if="props.fetchSessionSummary.length > 0"
        class="rounded-xl border border-border/50 bg-muted/20 p-4"
      >
        <p class="text-xs text-muted-foreground mb-2">Session State</p>
        <ul class="space-y-1 text-xs break-all">
          <li v-for="item in props.fetchSessionSummary" :key="item">{{ item }}</li>
        </ul>
      </div>
      <div
        v-if="props.fetchHtmlPreviewSummary.length > 0"
        class="rounded-xl border border-border/50 bg-muted/20 p-4"
      >
        <p class="text-xs text-muted-foreground mb-2">Fetch Preview</p>
        <ul class="space-y-1 text-xs break-all">
          <li v-for="item in props.fetchHtmlPreviewSummary" :key="item">{{ item }}</li>
        </ul>
      </div>
      <div
        v-if="props.rawFetchHtmlPreviewSummary.length > 0"
        class="rounded-xl border border-border/50 bg-muted/20 p-4"
      >
        <p class="text-xs text-muted-foreground mb-2">Raw Preview</p>
        <ul class="space-y-1 text-xs break-all">
          <li v-for="item in props.rawFetchHtmlPreviewSummary" :key="item">{{ item }}</li>
        </ul>
      </div>
      <div
        v-if="props.fetchHtmlCompareSummary.length > 0"
        class="rounded-xl border border-border/50 bg-muted/20 p-4"
      >
        <p class="text-xs text-muted-foreground mb-2">Compare Summary</p>
        <ul class="space-y-1 text-xs break-all">
          <li v-for="item in props.fetchHtmlCompareSummary" :key="item">{{ item }}</li>
        </ul>
      </div>
    </div>
    <div v-if="props.fetchHtmlError" class="px-5 pb-5">
      <div class="rounded-xl border border-red-400/40 bg-red-500/5 p-4">
        <p class="text-xs text-red-700 dark:text-red-300 break-all">{{ props.fetchHtmlError }}</p>
      </div>
    </div>
    <div v-if="props.fetchHtmlPreview || props.rawFetchHtmlPreview" class="px-5 pb-5">
      <div class="mb-3 flex gap-2">
        <button
          class="h-8 px-3 rounded-full border text-xs"
          :class="
            fetchHtmlViewMode === 'jina'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background hover:bg-muted'
          "
          @click="fetchHtmlViewMode = 'jina'"
        >
          Jina
        </button>
        <button
          class="h-8 px-3 rounded-full border text-xs"
          :class="
            fetchHtmlViewMode === 'raw'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background hover:bg-muted'
          "
          @click="fetchHtmlViewMode = 'raw'"
        >
          Raw
        </button>
        <button
          class="h-8 px-3 rounded-full border text-xs"
          :class="
            fetchHtmlViewMode === 'compare'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background hover:bg-muted'
          "
          @click="fetchHtmlViewMode = 'compare'"
        >
          Compare
        </button>
      </div>
      <textarea
        v-if="fetchHtmlViewMode === 'jina' && props.fetchHtmlPreview"
        :value="props.fetchHtmlPreview.html"
        readonly
        class="w-full min-h-56 rounded-xl border border-border/50 bg-background px-4 py-3 text-xs font-mono"
      />
      <textarea
        v-else-if="fetchHtmlViewMode === 'raw' && props.rawFetchHtmlPreview"
        :value="props.rawFetchHtmlPreview.html"
        readonly
        class="w-full min-h-56 rounded-xl border border-border/50 bg-background px-4 py-3 text-xs font-mono"
      />
      <div
        v-else-if="fetchHtmlViewMode === 'compare'"
        class="grid grid-cols-1 xl:grid-cols-2 gap-3"
      >
        <textarea
          :value="props.fetchHtmlPreview?.html || ''"
          readonly
          class="w-full min-h-56 rounded-xl border border-border/50 bg-background px-4 py-3 text-xs font-mono"
        />
        <textarea
          :value="props.rawFetchHtmlPreview?.html || ''"
          readonly
          class="w-full min-h-56 rounded-xl border border-border/50 bg-background px-4 py-3 text-xs font-mono"
        />
      </div>
    </div>
  </section>
</template>
