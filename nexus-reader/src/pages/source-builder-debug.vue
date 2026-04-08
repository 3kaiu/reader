<script setup lang="ts">
import { PageHeader } from '@/components/common'
import SourceBuilderPackagePanel from '@/components/source-builder/SourceBuilderPackagePanel.vue'
import SourceBuilderHumanSessionPanel from '@/components/source-builder/SourceBuilderHumanSessionPanel.vue'
import SourceBuilderRefinePanel from '@/components/source-builder/SourceBuilderRefinePanel.vue'
import SourceBuilderRunPanel from '@/components/source-builder/SourceBuilderRunPanel.vue'
import SourceBuilderValidationPanel from '@/components/source-builder/SourceBuilderValidationPanel.vue'
import { useSourceBuilderDebugView } from '@/composables/useSourceBuilderDebugView'

const {
  sourcePackagesLoading,
  sourcePackageImporting,
  sourcePackageDetailLoading,
  sourceBuildRunning,
  sourcePackages,
  sourceBuildPreviewSummary,
  currentPreviewSummary,
  currentPackageJson,
  currentDiagnosticsItems,
  currentPackage,
  currentRuntimeSourceId,
  currentRuntimeGovernanceSummary,
  runtimeOverviewSummary,
  runtimeGovernanceSuggestions,
  runtimeGovernanceLoading,
  runtimeGovernanceActionLoading,
  searchProfileSummary,
  fetchProfileSummary,
  validationStepSummary,
  fetchDebugSummary,
  bookCurl,
  chapterCurl,
  searchCurl,
  siteEntryCurl,
  searchKeyword,
  sourceId,
  sourceName,
  tagsText,
  fetchMode,
  fetchProvider,
  fetchServiceUrl,
  fetchEngine,
  fetchSessionKey,
  sessionCookiesText,
  sessionHeadersText,
  sessionLabel,
  sessionTtlSeconds,
  sessionLoading,
  fetchSessionSummary,
  fetchHtmlPreview,
  fetchHtmlPreviewSummary,
  rawFetchHtmlPreview,
  rawFetchHtmlPreviewSummary,
  fetchHtmlCompareSummary,
  fetchHtmlViewMode,
  debugSnapshotSummary,
  fetchHtmlUrl,
  fetchHtmlMethod,
  fetchHtmlBody,
  fetchHtmlForceRefresh,
  fetchHtmlLoading,
  fetchHtmlError,
  structuredHints,
  freeTextHints,
  refineLoading,
  refineAutoActions,
  refineAppliedHints,
  refineChanges,
  aiAssistLoading,
  aiAssistSummary,
  aiAssistOpsLeaderboard,
  aiAssistOpsRegressionTop,
  aiAssistOpsRecommendedActions,
  refineSuggestions,
  validateSearchQuery,
  validateBookUrl,
  validateTocUrl,
  validateChapterUrl,
  validationReport,
  validationLoading,
  runSearchQuery,
  runTargetUrl,
  runResult,
  runSearchDetailResult,
  runChaptersResult,
  runLoading,
  runSummary,
  runSearchResultItems,
  runExecutionProfileSummary,
  runSuggestedActions,
  runSearchDetailSummary,
  runSearchDetailSuggestedActions,
  runChaptersSummary,
  runChapterResultItems,
  runChaptersSuggestedActions,
  buildFromSamples,
  importFetchSession,
  loadFetchSession,
  previewFetchHtml,
  restoreDebugSnapshot,
  clearDebugSnapshots,
  importPreviewPackage,
  refreshPackages,
  refreshRuntimeGovernance,
  saveRuntimeSnapshot,
  exportRuntimeSnapshot,
  importRuntimeSnapshot,
  resetCurrentRuntimeState,
  selectPackage,
  validateCurrentPackage,
  applyRefineSuggestion,
  applyRefineSuggestionAndRefine,
  requestAiAssist,
  requestAiAssistAndRefine,
  refineCurrentPackage,
  runOperation,
  runSearchAndValidateDetail,
  runDetailValidation,
  runDetailAndChaptersValidation,
  clearPreview,
  goBack,
} = useSourceBuilderDebugView()
</script>

<template>
  <main class="px-5 max-w-7xl mx-auto pt-6 sm:pt-8 pb-32">
    <PageHeader @back="goBack" />

    <section class="mb-8 rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div class="p-5 border-b border-border/50">
        <p class="text-lg font-semibold">Source Builder Debug</p>
        <p class="text-xs text-muted-foreground mt-1">
          输入样本 curl，生成源站规则预览，并直接验证 search / book / chapters / content。
        </p>
      </div>

      <div class="p-5 grid grid-cols-1 xl:grid-cols-2 gap-4">
        <textarea v-model="bookCurl" class="w-full min-h-44 rounded-xl border border-border/50 bg-background px-4 py-3 text-xs font-mono" placeholder="book curl..." />
        <textarea v-model="chapterCurl" class="w-full min-h-44 rounded-xl border border-border/50 bg-background px-4 py-3 text-xs font-mono" placeholder="chapter curl..." />
        <textarea v-model="searchCurl" class="w-full min-h-36 rounded-xl border border-border/50 bg-background px-4 py-3 text-xs font-mono" placeholder="search curl，可选..." />
        <textarea v-model="siteEntryCurl" class="w-full min-h-36 rounded-xl border border-border/50 bg-background px-4 py-3 text-xs font-mono" placeholder="site entry curl，可选..." />
      </div>

      <div class="px-5 pb-5 grid grid-cols-1 md:grid-cols-4 gap-3">
        <input v-model="sourceId" class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm" placeholder="sourceId，可选" />
        <input v-model="sourceName" class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm" placeholder="sourceName，可选" />
        <input v-model="tagsText" class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm" placeholder="tags，逗号分隔" />
        <input v-model="searchKeyword" class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm" placeholder="search keyword，可选" />
      </div>

      <div class="px-5 pb-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <input v-model="fetchMode" class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm" placeholder="fetch mode，默认 external" />
        <input v-model="fetchProvider" class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm" placeholder="fetch provider，默认 jina_reader" />
        <input v-model="fetchServiceUrl" class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm" placeholder="保留字段，可留空" />
        <input v-model="fetchEngine" class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm" placeholder="jina respondWith，如 markdown / text / html" />
      </div>

      <div class="px-5 pb-5 flex gap-2 justify-end">
        <button class="h-9 px-4 rounded-full border bg-background hover:bg-muted text-sm" @click="clearPreview">清空预览</button>
        <button class="h-9 px-4 rounded-full text-sm bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50" :disabled="sourceBuildRunning || !bookCurl.trim() || !chapterCurl.trim()" @click="buildFromSamples">
          {{ sourceBuildRunning ? '构建中...' : '生成规则包预览' }}
        </button>
      </div>
    </section>

    <section class="mb-8 rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div class="p-5 border-b border-border/50 flex items-center justify-between gap-3">
        <div>
          <p class="text-sm font-medium">Runtime Governance</p>
          <p class="text-xs text-muted-foreground mt-1">
            将当前 builder 调试对象与运行时治理状态对齐，直接执行保存快照、导出快照和分级 reset。
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button class="h-8 px-3 rounded-full border bg-background hover:bg-muted text-xs disabled:opacity-50" :disabled="runtimeGovernanceLoading" @click="refreshRuntimeGovernance">
            {{ runtimeGovernanceLoading ? '刷新中...' : '刷新治理状态' }}
          </button>
          <button class="h-8 px-3 rounded-full border bg-background hover:bg-muted text-xs disabled:opacity-50" :disabled="runtimeGovernanceActionLoading" @click="saveRuntimeSnapshot">
            {{ runtimeGovernanceActionLoading ? '处理中...' : '保存快照' }}
          </button>
          <button class="h-8 px-3 rounded-full border bg-background hover:bg-muted text-xs disabled:opacity-50" :disabled="runtimeGovernanceActionLoading" @click="exportRuntimeSnapshot">
            {{ runtimeGovernanceActionLoading ? '处理中...' : '导出治理快照' }}
          </button>
          <button class="h-8 px-3 rounded-full border bg-background hover:bg-muted text-xs disabled:opacity-50" :disabled="runtimeGovernanceActionLoading" @click="importRuntimeSnapshot">
            {{ runtimeGovernanceActionLoading ? '处理中...' : '导入治理快照' }}
          </button>
        </div>
      </div>
      <div class="p-5 grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div class="rounded-xl border border-border/50 bg-muted/20 p-4">
          <p class="text-xs text-muted-foreground mb-2">Current Source Runtime</p>
          <p class="text-sm font-medium break-all">{{ currentRuntimeSourceId || '--' }}</p>
          <ul v-if="currentRuntimeGovernanceSummary.length > 0" class="mt-3 space-y-1 text-xs break-all">
            <li v-for="item in currentRuntimeGovernanceSummary" :key="item">{{ item }}</li>
          </ul>
          <p v-else class="mt-3 text-xs text-muted-foreground">
            当前 builder 还没有可关联的运行时 source，导入包或填写 sourceId 后可查看。
          </p>
          <div class="mt-4 flex flex-wrap gap-2">
            <button class="h-8 px-3 rounded-full border bg-background hover:bg-muted text-xs disabled:opacity-50" :disabled="runtimeGovernanceActionLoading || !currentRuntimeSourceId" @click="resetCurrentRuntimeState('circuit_only')">
              仅重置熔断
            </button>
            <button class="h-8 px-3 rounded-full border bg-background hover:bg-muted text-xs disabled:opacity-50" :disabled="runtimeGovernanceActionLoading || !currentRuntimeSourceId" @click="resetCurrentRuntimeState('full')">
              全量重置治理状态
            </button>
          </div>
        </div>
        <div class="rounded-xl border border-border/50 bg-muted/20 p-4">
          <p class="text-xs text-muted-foreground mb-2">Runtime Overview</p>
          <ul v-if="runtimeOverviewSummary.length > 0" class="space-y-1 text-xs break-all">
            <li v-for="item in runtimeOverviewSummary" :key="item">{{ item }}</li>
          </ul>
          <p v-else class="text-xs text-muted-foreground">当前还没有治理总览数据。</p>
          <div v-if="runtimeGovernanceSuggestions.length > 0" class="mt-4">
            <p class="text-xs text-muted-foreground mb-2">治理建议</p>
            <ul class="space-y-1 text-xs break-all">
              <li v-for="item in runtimeGovernanceSuggestions" :key="item">{{ item }}</li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <SourceBuilderHumanSessionPanel
      v-model:fetch-session-key="fetchSessionKey"
      v-model:session-label="sessionLabel"
      v-model:session-ttl-seconds="sessionTtlSeconds"
      v-model:session-cookies-text="sessionCookiesText"
      v-model:session-headers-text="sessionHeadersText"
      v-model:fetch-html-url="fetchHtmlUrl"
      v-model:fetch-html-method="fetchHtmlMethod"
      v-model:fetch-html-body="fetchHtmlBody"
      v-model:fetch-html-force-refresh="fetchHtmlForceRefresh"
      v-model:fetch-html-view-mode="fetchHtmlViewMode"
      :session-loading="sessionLoading"
      :fetch-html-loading="fetchHtmlLoading"
      :fetch-session-summary="fetchSessionSummary"
      :fetch-html-preview-summary="fetchHtmlPreviewSummary"
      :raw-fetch-html-preview-summary="rawFetchHtmlPreviewSummary"
      :fetch-html-compare-summary="fetchHtmlCompareSummary"
      :fetch-html-error="fetchHtmlError"
      :fetch-html-preview="fetchHtmlPreview"
      :raw-fetch-html-preview="rawFetchHtmlPreview"
      @load-fetch-session="loadFetchSession"
      @import-fetch-session="importFetchSession"
      @preview-fetch-html="previewFetchHtml"
    />

    <section class="mb-8 rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div class="p-5 border-b border-border/50 flex items-center justify-between gap-3">
        <div>
          <p class="text-sm font-medium">Debug Snapshots</p>
          <p class="text-xs text-muted-foreground mt-1">本地保存最近 20 次 session/build/validate/refine/fetch 快照。</p>
        </div>
        <button class="h-8 px-3 rounded-full border bg-background hover:bg-muted text-xs disabled:opacity-50" :disabled="debugSnapshotSummary.length === 0" @click="clearDebugSnapshots">
          清空快照
        </button>
      </div>
      <div v-if="debugSnapshotSummary.length > 0" class="p-5 grid grid-cols-1 xl:grid-cols-2 gap-3">
        <div v-for="item in debugSnapshotSummary" :key="item.id" class="rounded-xl border border-border/50 bg-muted/20 p-4">
          <p class="text-sm font-medium">{{ item.title }}</p>
          <p class="text-xs text-muted-foreground mt-1">{{ item.subtitle }}</p>
          <div class="mt-3 flex justify-end">
            <button class="h-8 px-3 rounded-full border bg-background hover:bg-muted text-xs" @click="restoreDebugSnapshot(item.id)">
              恢复快照
            </button>
          </div>
        </div>
      </div>
      <div v-else class="p-5">
        <p class="text-xs text-muted-foreground">当前还没有调试快照。</p>
      </div>
    </section>

    <SourceBuilderPackagePanel
      :source-packages-loading="sourcePackagesLoading"
      :source-packages="sourcePackages"
      :source-package-detail-loading="sourcePackageDetailLoading"
      :source-package-importing="sourcePackageImporting"
      :current-package-json="currentPackageJson"
      :current-diagnostics-items="currentDiagnosticsItems"
      :current-preview-summary="currentPreviewSummary"
      :search-profile-summary="searchProfileSummary"
      :fetch-profile-summary="fetchProfileSummary"
      :package-json-available="Boolean(sourceBuildPreviewSummary.packageJson)"
      @refresh-packages="refreshPackages"
      @select-package="selectPackage"
      @import-preview-package="importPreviewPackage"
    />

    <SourceBuilderValidationPanel
      v-model:validate-search-query="validateSearchQuery"
      v-model:validate-book-url="validateBookUrl"
      v-model:validate-toc-url="validateTocUrl"
      v-model:validate-chapter-url="validateChapterUrl"
      :validation-loading="validationLoading"
      :has-current-package="Boolean(currentPackage)"
      :validation-step-summary="validationStepSummary"
      :fetch-debug-summary="fetchDebugSummary"
      :validation-report="validationReport"
      @validate-current-package="validateCurrentPackage"
    />

    <SourceBuilderRefinePanel
      v-model:structured-hints="structuredHints"
      v-model:free-text-hints="freeTextHints"
      :refine-suggestions="refineSuggestions"
      :refine-loading="refineLoading"
      :has-current-package="Boolean(currentPackage)"
      :refine-auto-actions="refineAutoActions"
      :refine-applied-hints="refineAppliedHints"
      :refine-changes="refineChanges"
      :ai-assist-loading="aiAssistLoading"
      :ai-assist-summary="aiAssistSummary"
      :ai-assist-ops-leaderboard="aiAssistOpsLeaderboard"
      :ai-assist-ops-regression-top="aiAssistOpsRegressionTop"
      :ai-assist-ops-recommended-actions="aiAssistOpsRecommendedActions"
      @apply-refine-suggestion="applyRefineSuggestion"
      @apply-refine-suggestion-and-refine="applyRefineSuggestionAndRefine"
      @request-ai-assist="requestAiAssist"
      @request-ai-assist-and-refine="requestAiAssistAndRefine"
      @refine-current-package="refineCurrentPackage"
    />

    <SourceBuilderRunPanel
      v-model:run-search-query="runSearchQuery"
      v-model:run-target-url="runTargetUrl"
      :run-loading="runLoading"
      :has-current-package="Boolean(currentPackage)"
      :run-execution-profile-summary="runExecutionProfileSummary"
      :run-result="runResult"
      :run-summary="runSummary"
      :run-search-result-items="runSearchResultItems"
      :run-suggested-actions="runSuggestedActions"
      :run-search-detail-result="runSearchDetailResult"
      :run-search-detail-summary="runSearchDetailSummary"
      :run-search-detail-suggested-actions="runSearchDetailSuggestedActions"
      :run-chapters-result="runChaptersResult"
      :run-chapters-summary="runChaptersSummary"
      :run-chapter-result-items="runChapterResultItems"
      :run-chapters-suggested-actions="runChaptersSuggestedActions"
      @run-operation="runOperation"
      @run-search-and-validate-detail="runSearchAndValidateDetail"
      @run-detail-validation="runDetailValidation"
      @run-detail-and-chapters-validation="runDetailAndChaptersValidation"
    />
  </main>
</template>
