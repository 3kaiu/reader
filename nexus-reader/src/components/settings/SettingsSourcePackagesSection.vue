<script setup lang="ts">
import { computed, ref } from 'vue'
import { Database, FileJson, RefreshCw, SquareArrowOutUpRight, Trash2 } from 'lucide-vue-next'

type SourcePackageSummary = {
  sourceId: string
  sourceName: string
  host: string
  packageId: string
  generatedAtMs: number
  enabled: boolean
  valid: boolean
  readinessState:
    | 'draft'
    | 'blocked'
    | 'search_ready'
    | 'catalog_ready'
    | 'reading_ready'
    | 'full_flow_ready'
  searchable: boolean
  detailReady: boolean
  tocReady: boolean
  readable: boolean
  overallHealthScore: number
  recommended: boolean
  searchStatus: 'pass' | 'warn' | 'fail' | 'unknown'
  bookStatus: 'pass' | 'warn' | 'fail' | 'unknown'
  tocStatus: 'pass' | 'warn' | 'fail' | 'unknown'
  contentStatus: 'pass' | 'warn' | 'fail' | 'unknown'
  tags: string[]
}

type SourcePackageDetailSummary = {
  packageId: string
  sourceLabel: string
  generatedAtLabel: string
  validationLabel: string
  healthLabel: string
  healthScoreLabel: string
  segmentItems: string[]
  warningItems: string[]
  errorItems: string[]
  capabilityItems: string[]
  searchStrategyItems: string[]
  sampleItems: string[]
  riskItems: string[]
  readinessBlockers: string[]
  readinessSuggestedActions: string[]
}

const props = defineProps<{
  sourcePackagesLoading: boolean
  sourcePackageImporting: boolean
  sourcePackageDetailLoading: boolean
  sourcePackages: SourcePackageSummary[]
  sourcePackageDetailSummary: SourcePackageDetailSummary
}>()

const emit = defineEmits<{
  refreshSourcePackages: []
  importSourcePackage: [packageJson: string]
  selectSourcePackage: [sourceId: string]
  deleteSourcePackage: [sourceId: string]
  navigate: [path: string]
}>()

const importJson = ref('')
const selectedSourceId = ref('')

const sortedPackages = computed(() =>
  [...props.sourcePackages].sort((a, b) => b.generatedAtMs - a.generatedAtMs)
)

function submitImport() {
  if (!importJson.value.trim()) {
    return
  }
  emit('importSourcePackage', importJson.value)
  importJson.value = ''
}

function selectPackage(sourceId: string) {
  selectedSourceId.value = sourceId
  emit('selectSourcePackage', sourceId)
}

function healthClass(status: 'pass' | 'warn' | 'fail' | 'unknown') {
  if (status === 'pass') return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
  if (status === 'warn') return 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
  if (status === 'fail') return 'bg-red-500/15 text-red-700 dark:text-red-300'
  return 'bg-muted text-muted-foreground'
}

function readinessLabel(state: SourcePackageSummary['readinessState']) {
  switch (state) {
    case 'full_flow_ready':
      return '全链路可用'
    case 'reading_ready':
      return '可读待搜'
    case 'catalog_ready':
      return '目录就绪'
    case 'search_ready':
      return '可搜索'
    case 'blocked':
      return '阻塞'
    default:
      return '草稿'
  }
}

function readinessClass(state: SourcePackageSummary['readinessState']) {
  if (state === 'full_flow_ready') return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
  if (state === 'reading_ready' || state === 'catalog_ready' || state === 'search_ready') {
    return 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
  }
  if (state === 'blocked') return 'bg-red-500/15 text-red-700 dark:text-red-300'
  return 'bg-muted text-muted-foreground'
}
</script>

<template>
  <section class="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300">
    <div class="flex items-center gap-2 mb-4 px-1">
      <Database class="w-4 h-4 text-primary" />
      <h2 class="text-sm font-bold text-muted-foreground uppercase tracking-wider">源规则包</h2>
      <button
        class="ml-auto h-8 px-3 text-xs rounded-full border bg-background hover:bg-muted transition-colors"
        :disabled="sourcePackagesLoading"
        @click="emit('refreshSourcePackages')"
      >
        {{ sourcePackagesLoading ? '刷新中...' : '刷新列表' }}
      </button>
    </div>

    <div class="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div class="p-5 border-b border-border/50">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-medium">Source Builder Debug</p>
            <p class="text-xs text-muted-foreground mt-1">
              样本 curl 建站、session 导入、规则验证与 refine 已迁移到独立工作台。
            </p>
          </div>
          <button
            class="h-9 px-4 rounded-full text-sm bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            @click="emit('navigate', '/source-builder-debug')"
          >
            <SquareArrowOutUpRight class="w-4 h-4 inline-block mr-1" />
            打开工作台
          </button>
        </div>
      </div>

      <div class="p-5 border-b border-border/50">
        <div class="flex items-center gap-2 mb-2">
          <FileJson class="w-4 h-4 text-primary" />
          <p class="text-sm font-medium">导入 SourceRulePackage</p>
        </div>
        <p class="text-xs text-muted-foreground mb-3">
          直接粘贴后端 `build-from-samples` 生成的 package JSON。
        </p>
        <textarea
          v-model="importJson"
          class="w-full min-h-40 rounded-xl border border-border/50 bg-background px-4 py-3 text-xs font-mono"
          placeholder='{"packageId":"...","source":{...}}'
        />
        <div class="flex justify-end mt-3">
          <button
            class="h-9 px-4 rounded-full text-sm bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            :disabled="sourcePackageImporting || !importJson.trim()"
            @click="submitImport"
          >
            {{ sourcePackageImporting ? '导入中...' : '导入规则包' }}
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr]">
        <div class="p-5 border-b lg:border-b-0 lg:border-r border-border/50">
          <div class="flex items-center gap-2 mb-3">
            <RefreshCw class="w-4 h-4 text-primary" />
            <p class="text-sm font-medium">已导入源站</p>
          </div>

          <div v-if="sortedPackages.length > 0" class="space-y-3">
            <button
              v-for="item in sortedPackages"
              :key="item.sourceId"
              class="w-full text-left rounded-xl border p-4 transition-colors"
              :class="
                selectedSourceId === item.sourceId
                  ? 'border-primary bg-primary/5'
                  : 'border-border/50 bg-muted/20 hover:bg-muted/35'
              "
              @click="selectPackage(item.sourceId)"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-sm font-medium truncate">{{ item.sourceName }}</p>
                  <p class="text-xs text-muted-foreground truncate">
                    {{ item.sourceId }} · {{ item.host }}
                  </p>
                </div>
                <span
                  class="shrink-0 rounded-full px-2 py-1 text-[11px]"
                  :class="
                    item.recommended
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                  "
                >
                  {{ item.recommended ? '推荐' : '待复核' }}
                </span>
              </div>
              <p class="text-xs text-muted-foreground mt-2">
                {{ new Date(item.generatedAtMs).toLocaleString() }} · 健康
                {{ Math.round(item.overallHealthScore * 100) }}
              </p>
              <div class="mt-2 flex flex-wrap gap-2">
                <span
                  class="rounded-full px-2 py-1 text-[11px]"
                  :class="readinessClass(item.readinessState)"
                >
                  {{ readinessLabel(item.readinessState) }}
                </span>
                <span
                  class="rounded-full px-2 py-1 text-[11px]"
                  :class="
                    item.searchable
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : 'bg-red-500/15 text-red-700 dark:text-red-300'
                  "
                >
                  搜索{{ item.searchable ? '✓' : '✗' }}
                </span>
                <span
                  class="rounded-full px-2 py-1 text-[11px]"
                  :class="
                    item.detailReady
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : 'bg-red-500/15 text-red-700 dark:text-red-300'
                  "
                >
                  详情{{ item.detailReady ? '✓' : '✗' }}
                </span>
                <span
                  class="rounded-full px-2 py-1 text-[11px]"
                  :class="
                    item.tocReady
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : 'bg-red-500/15 text-red-700 dark:text-red-300'
                  "
                >
                  目录{{ item.tocReady ? '✓' : '✗' }}
                </span>
                <span
                  class="rounded-full px-2 py-1 text-[11px]"
                  :class="
                    item.readable
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : 'bg-red-500/15 text-red-700 dark:text-red-300'
                  "
                >
                  正文{{ item.readable ? '✓' : '✗' }}
                </span>
              </div>
              <div class="mt-2 flex flex-wrap gap-2">
                <span
                  class="rounded-full px-2 py-1 text-[11px]"
                  :class="healthClass(item.searchStatus)"
                  >搜索</span
                >
                <span
                  class="rounded-full px-2 py-1 text-[11px]"
                  :class="healthClass(item.bookStatus)"
                  >详情</span
                >
                <span
                  class="rounded-full px-2 py-1 text-[11px]"
                  :class="healthClass(item.tocStatus)"
                  >目录</span
                >
                <span
                  class="rounded-full px-2 py-1 text-[11px]"
                  :class="healthClass(item.contentStatus)"
                  >正文</span
                >
              </div>
              <div class="flex items-center justify-between mt-3">
                <div class="flex flex-wrap gap-2">
                  <span
                    v-for="tag in item.tags"
                    :key="tag"
                    class="rounded-full border border-border/50 px-2 py-1 text-[11px] text-muted-foreground"
                  >
                    {{ tag }}
                  </span>
                </div>
                <button
                  class="h-8 px-3 rounded-full border border-red-500/20 text-red-600 text-xs hover:bg-red-500/5"
                  @click.stop="emit('deleteSourcePackage', item.sourceId)"
                >
                  <Trash2 class="w-3.5 h-3.5 inline-block mr-1" />
                  删除
                </button>
              </div>
            </button>
          </div>

          <p v-else class="text-xs text-muted-foreground/70">
            {{ sourcePackagesLoading ? '正在加载源规则包...' : '暂无已导入源规则包' }}
          </p>
        </div>

        <div class="p-5">
          <p class="text-sm font-medium mb-3">规则包详情</p>
          <p v-if="sourcePackageDetailLoading" class="text-xs text-muted-foreground">
            详情加载中...
          </p>
          <div v-else class="space-y-4">
            <div class="rounded-xl border border-border/50 bg-muted/20 p-4">
              <p class="text-xs text-muted-foreground mb-1">来源</p>
              <p class="text-sm font-medium">{{ sourcePackageDetailSummary.sourceLabel }}</p>
              <p class="text-xs text-muted-foreground mt-2">
                packageId: {{ sourcePackageDetailSummary.packageId }}
              </p>
              <p class="text-xs text-muted-foreground mt-1">
                生成时间: {{ sourcePackageDetailSummary.generatedAtLabel }}
              </p>
              <p class="text-xs text-muted-foreground mt-1">
                校验: {{ sourcePackageDetailSummary.validationLabel }}
              </p>
              <p class="text-xs text-muted-foreground mt-1">
                健康: {{ sourcePackageDetailSummary.healthLabel }} ·
                {{ sourcePackageDetailSummary.healthScoreLabel }}
              </p>
            </div>

            <div class="rounded-xl border border-border/50 bg-muted/20 p-4">
              <p class="text-xs text-muted-foreground mb-2">健康分段</p>
              <ul class="space-y-1 text-xs break-all">
                <li v-for="item in sourcePackageDetailSummary.segmentItems" :key="item">
                  {{ item }}
                </li>
              </ul>
            </div>

            <div class="rounded-xl border border-border/50 bg-muted/20 p-4">
              <p class="text-xs text-muted-foreground mb-2">能力矩阵</p>
              <ul class="space-y-1 text-xs">
                <li v-for="item in sourcePackageDetailSummary.capabilityItems" :key="item">
                  {{ item }}
                </li>
              </ul>
            </div>

            <div class="rounded-xl border border-border/50 bg-muted/20 p-4">
              <p class="text-xs text-muted-foreground mb-2">搜索策略</p>
              <ul
                v-if="sourcePackageDetailSummary.searchStrategyItems.length > 0"
                class="space-y-1 text-xs break-all"
              >
                <li v-for="item in sourcePackageDetailSummary.searchStrategyItems" :key="item">
                  {{ item }}
                </li>
              </ul>
              <p v-else class="text-xs text-muted-foreground">当前规则包没有显式 searchProfile</p>
            </div>

            <div class="rounded-xl border border-border/50 bg-muted/20 p-4">
              <p class="text-xs text-muted-foreground mb-2">样本</p>
              <ul class="space-y-1 text-xs break-all">
                <li v-for="item in sourcePackageDetailSummary.sampleItems" :key="item">
                  {{ item }}
                </li>
              </ul>
            </div>

            <div
              v-if="sourcePackageDetailSummary.readinessSuggestedActions.length > 0"
              class="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4"
            >
              <p class="text-xs text-emerald-700 dark:text-emerald-300 mb-2">建议动作</p>
              <ul class="space-y-1 text-xs break-all text-emerald-700 dark:text-emerald-300">
                <li
                  v-for="item in sourcePackageDetailSummary.readinessSuggestedActions"
                  :key="item"
                >
                  {{ item }}
                </li>
              </ul>
            </div>

            <div
              v-if="sourcePackageDetailSummary.readinessBlockers.length > 0"
              class="rounded-xl border border-red-500/20 bg-red-500/5 p-4"
            >
              <p class="text-xs text-red-700 dark:text-red-300 mb-2">流程阻塞项</p>
              <ul class="space-y-1 text-xs break-all text-red-700 dark:text-red-300">
                <li v-for="item in sourcePackageDetailSummary.readinessBlockers" :key="item">
                  {{ item }}
                </li>
              </ul>
            </div>

            <div
              v-if="sourcePackageDetailSummary.warningItems.length > 0"
              class="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4"
            >
              <p class="text-xs text-amber-700 dark:text-amber-300 mb-2">Warnings</p>
              <ul class="space-y-1 text-xs">
                <li v-for="item in sourcePackageDetailSummary.warningItems" :key="item">
                  {{ item }}
                </li>
              </ul>
            </div>

            <div
              v-if="sourcePackageDetailSummary.errorItems.length > 0"
              class="rounded-xl border border-red-500/20 bg-red-500/5 p-4"
            >
              <p class="text-xs text-red-700 dark:text-red-300 mb-2">Errors</p>
              <ul class="space-y-1 text-xs">
                <li v-for="item in sourcePackageDetailSummary.errorItems" :key="item">
                  {{ item }}
                </li>
              </ul>
            </div>

            <div
              v-if="sourcePackageDetailSummary.riskItems.length > 0"
              class="rounded-xl border border-border/50 bg-muted/20 p-4"
            >
              <p class="text-xs text-muted-foreground mb-2">已知风险</p>
              <ul class="space-y-1 text-xs">
                <li v-for="item in sourcePackageDetailSummary.riskItems" :key="item">{{ item }}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
