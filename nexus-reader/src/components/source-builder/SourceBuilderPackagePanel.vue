<script setup lang="ts">
interface SourcePackageListItem {
  sourceId: string
  sourceName: string
  host: string
}

interface PreviewSummary {
  sourceLabel: string
  packageId: string
  validationLabel: string
  healthLabel: string
  healthScoreLabel: string
  importable: boolean
  segmentItems: string[]
  readinessBlockers: string[]
  readinessSuggestedActions: string[]
  hasPreview: boolean
}

interface SearchProfileSummaryItem {
  id: string
  mode: string
  enabled: boolean | string
  priority: string | number
  provider: string
  note: string
}

const props = defineProps<{
  sourcePackagesLoading: boolean
  sourcePackages: SourcePackageListItem[]
  sourcePackageDetailLoading: boolean
  sourcePackageImporting: boolean
  currentPackageJson: string
  currentDiagnosticsItems: string[]
  currentPreviewSummary: PreviewSummary
  searchProfileSummary: SearchProfileSummaryItem[]
  fetchProfileSummary: string
  packageJsonAvailable: boolean
  importGuardSummary: string[]
  importBlocked: boolean
}>()

const emit = defineEmits<{
  refreshPackages: []
  selectPackage: [sourceId: string]
  importPreviewPackage: []
}>()
</script>

<template>
  <section class="mb-8 grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-4">
    <div class="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div class="p-5 border-b border-border/50 flex items-center justify-between">
        <div>
          <p class="text-sm font-medium">已导入源规则包</p>
          <p class="text-xs text-muted-foreground mt-1">选择一个已导入 package 进行调试</p>
        </div>
        <button
          class="h-8 px-3 text-xs rounded-full border bg-background hover:bg-muted transition-colors"
          :disabled="props.sourcePackagesLoading"
          @click="emit('refreshPackages')"
        >
          {{ props.sourcePackagesLoading ? '刷新中...' : '刷新' }}
        </button>
      </div>
      <div class="p-5 space-y-3">
        <button
          v-for="item in props.sourcePackages"
          :key="item.sourceId"
          class="w-full text-left rounded-xl border border-border/50 bg-muted/20 p-4 hover:bg-muted/35 transition-colors"
          @click="emit('selectPackage', item.sourceId)"
        >
          <p class="text-sm font-medium">{{ item.sourceName }}</p>
          <p class="text-xs text-muted-foreground mt-1">{{ item.sourceId }} · {{ item.host }}</p>
        </button>
      </div>
    </div>

    <div class="rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div class="p-5 border-b border-border/50 flex items-center justify-between">
        <div>
          <p class="text-sm font-medium">当前规则包</p>
          <p class="text-xs text-muted-foreground mt-1">{{ props.currentPreviewSummary.sourceLabel }}</p>
        </div>
        <div class="flex items-center gap-3">
          <p v-if="props.sourcePackageDetailLoading" class="text-xs text-muted-foreground">
            规则包详情加载中...
          </p>
          <button
            class="h-9 px-4 rounded-full text-sm bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            :disabled="props.sourcePackageImporting || !props.packageJsonAvailable || props.importBlocked"
            @click="emit('importPreviewPackage')"
          >
            {{
              props.sourcePackageImporting
                ? '导入中...'
                : props.importBlocked
                  ? '导入已阻断'
                  : '导入当前预览包'
            }}
          </button>
        </div>
      </div>
      <div class="p-5 space-y-4">
        <div
          v-if="props.importGuardSummary.length > 0"
          class="rounded-xl border border-rose-500/25 bg-rose-500/5 p-4"
        >
          <p class="text-xs text-rose-700 dark:text-rose-300 mb-2">导入阻断提示</p>
          <ul class="space-y-1 text-xs break-all text-rose-700 dark:text-rose-300">
            <li v-for="item in props.importGuardSummary" :key="item">{{ item }}</li>
          </ul>
        </div>

        <div class="rounded-xl border border-border/50 bg-muted/20 p-4">
          <p class="text-xs text-muted-foreground mb-1">packageId</p>
          <p class="text-sm font-medium break-all">{{ props.currentPreviewSummary.packageId }}</p>
          <p class="text-xs text-muted-foreground mt-2">校验: {{ props.currentPreviewSummary.validationLabel }}</p>
          <p class="text-xs text-muted-foreground mt-1">
            健康: {{ props.currentPreviewSummary.healthLabel }} · {{ props.currentPreviewSummary.healthScoreLabel }}
          </p>
          <p class="text-xs text-muted-foreground mt-1">
            可导入: {{ props.currentPreviewSummary.importable ? '是' : '否' }}
          </p>
          <p class="text-xs text-muted-foreground mt-1">fetch: {{ props.fetchProfileSummary }}</p>
        </div>

        <div
          v-if="props.currentPreviewSummary.readinessSuggestedActions.length > 0"
          class="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4"
        >
          <p class="text-xs text-emerald-700 dark:text-emerald-300 mb-2">建议动作</p>
          <ul class="space-y-1 text-xs break-all text-emerald-700 dark:text-emerald-300">
            <li v-for="item in props.currentPreviewSummary.readinessSuggestedActions" :key="item">
              {{ item }}
            </li>
          </ul>
        </div>

        <div
          v-if="props.currentPreviewSummary.readinessBlockers.length > 0"
          class="rounded-xl border border-red-500/20 bg-red-500/5 p-4"
        >
          <p class="text-xs text-red-700 dark:text-red-300 mb-2">流程阻塞项</p>
          <ul class="space-y-1 text-xs break-all text-red-700 dark:text-red-300">
            <li v-for="item in props.currentPreviewSummary.readinessBlockers" :key="item">
              {{ item }}
            </li>
          </ul>
        </div>

        <div
          v-if="props.currentPreviewSummary.segmentItems.length > 0"
          class="rounded-xl border border-border/50 bg-muted/20 p-4"
        >
          <p class="text-xs text-muted-foreground mb-2">健康分段</p>
          <ul class="space-y-1 text-xs break-all">
            <li v-for="item in props.currentPreviewSummary.segmentItems" :key="item">{{ item }}</li>
          </ul>
        </div>

        <div class="rounded-xl border border-border/50 bg-muted/20 p-4">
          <p class="text-xs text-muted-foreground mb-2">搜索策略</p>
          <div v-if="props.searchProfileSummary.length > 0" class="space-y-2">
            <div
              v-for="item in props.searchProfileSummary"
              :key="item.id"
              class="rounded-lg border border-border/40 bg-background p-3"
            >
              <p class="text-xs font-medium">{{ item.id }} · {{ item.mode }}</p>
              <p class="text-xs text-muted-foreground mt-1">
                enabled={{ item.enabled }} · priority={{ item.priority }} · provider={{ item.provider }}
              </p>
              <p class="text-xs text-muted-foreground mt-1 break-all">{{ item.note }}</p>
            </div>
          </div>
          <p v-else class="text-xs text-muted-foreground">当前 package 没有显式 searchProfile</p>
        </div>

        <div
          v-if="props.currentPreviewSummary.hasPreview"
          class="rounded-xl border border-border/50 bg-muted/20 p-4"
        >
          <p class="text-xs text-muted-foreground mb-2">构建诊断</p>
          <ul class="space-y-1 text-xs break-all">
            <li v-for="item in props.currentDiagnosticsItems" :key="item">{{ item }}</li>
          </ul>
        </div>

        <textarea
          v-if="props.currentPackageJson"
          :value="props.currentPackageJson"
          readonly
          class="w-full min-h-52 rounded-xl border border-border/50 bg-background px-4 py-3 text-xs font-mono"
        />
      </div>
    </div>
  </section>
</template>
