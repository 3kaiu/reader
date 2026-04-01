<script setup lang="ts">
import { PageHeader } from '@/components/common'
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
  runLoading,
  buildFromSamples,
  importFetchSession,
  loadFetchSession,
  previewFetchHtml,
  restoreDebugSnapshot,
  clearDebugSnapshots,
  importPreviewPackage,
  refreshPackages,
  selectPackage,
  validateCurrentPackage,
  applyRefineSuggestion,
  applyRefineSuggestionAndRefine,
  refineCurrentPackage,
  runOperation,
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
        <input v-model="fetchMode" class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm" placeholder="fetch mode，如 replay / external" />
        <input v-model="fetchProvider" class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm" placeholder="fetch provider，如 curl_replay / external_service" />
        <input v-model="fetchServiceUrl" class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm" placeholder="external service url，可选" />
        <input v-model="fetchEngine" class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm" placeholder="external engine，可选" />
      </div>

      <div class="px-5 pb-5 flex gap-2 justify-end">
        <button class="h-9 px-4 rounded-full border bg-background hover:bg-muted text-sm" @click="clearPreview">清空预览</button>
        <button class="h-9 px-4 rounded-full text-sm bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50" :disabled="sourceBuildRunning || !bookCurl.trim() || !chapterCurl.trim()" @click="buildFromSamples">
          {{ sourceBuildRunning ? '构建中...' : '生成规则包预览' }}
        </button>
      </div>
    </section>

    <section class="mb-8 rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div class="p-5 border-b border-border/50">
        <p class="text-sm font-medium">Human Session</p>
        <p class="text-xs text-muted-foreground mt-1">
          人工过一次站点后，把 cookies / headers 导入这里，后续构建和 HTML 预抓取都复用这个 session。
        </p>
      </div>
      <div class="p-5 grid grid-cols-1 md:grid-cols-3 gap-3">
        <input v-model="fetchSessionKey" class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm" placeholder="session key" />
        <input v-model="sessionLabel" class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm" placeholder="label，可选" />
        <input v-model="sessionTtlSeconds" type="number" min="60" class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm" placeholder="ttl seconds" />
      </div>
      <div class="px-5 pb-5 grid grid-cols-1 xl:grid-cols-2 gap-4">
        <textarea v-model="sessionCookiesText" class="w-full min-h-32 rounded-xl border border-border/50 bg-background px-4 py-3 text-xs font-mono" placeholder="cookies，支持 a=b; c=d 或多行" />
        <textarea v-model="sessionHeadersText" class="w-full min-h-32 rounded-xl border border-border/50 bg-background px-4 py-3 text-xs font-mono" placeholder="headers，支持 JSON 或多行 Header: Value" />
      </div>
      <div class="px-5 pb-5 grid grid-cols-1 md:grid-cols-[1.2fr_1fr_1fr_auto] gap-3">
        <input v-model="fetchHtmlUrl" class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm" placeholder="HTML preview url" />
        <input v-model="fetchHtmlMethod" class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm" placeholder="GET / POST" />
        <label class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm flex items-center gap-2">
          <input v-model="fetchHtmlForceRefresh" type="checkbox" />
          force refresh
        </label>
        <div class="flex justify-end gap-2">
          <button class="h-9 px-4 rounded-full border bg-background hover:bg-muted text-sm disabled:opacity-50" :disabled="sessionLoading || !fetchSessionKey.trim()" @click="loadFetchSession">
            {{ sessionLoading ? '处理中...' : '检查 Session' }}
          </button>
          <button class="h-9 px-4 rounded-full border bg-background hover:bg-muted text-sm disabled:opacity-50" :disabled="sessionLoading || !fetchSessionKey.trim()" @click="importFetchSession">
            {{ sessionLoading ? '处理中...' : '导入 Session' }}
          </button>
          <button class="h-9 px-4 rounded-full text-sm bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50" :disabled="fetchHtmlLoading || !fetchHtmlUrl.trim()" @click="previewFetchHtml">
            {{ fetchHtmlLoading ? '抓取中...' : '预抓取 HTML' }}
          </button>
        </div>
      </div>
      <div v-if="fetchHtmlMethod.trim().toUpperCase() !== 'GET'" class="px-5 pb-5">
        <textarea v-model="fetchHtmlBody" class="w-full min-h-24 rounded-xl border border-border/50 bg-background px-4 py-3 text-xs font-mono" placeholder="fetch body，可选" />
      </div>
      <div v-if="fetchSessionSummary.length > 0 || fetchHtmlPreviewSummary.length > 0" class="px-5 pb-5 grid grid-cols-1 xl:grid-cols-2 gap-3">
        <div v-if="fetchSessionSummary.length > 0" class="rounded-xl border border-border/50 bg-muted/20 p-4">
          <p class="text-xs text-muted-foreground mb-2">Session State</p>
          <ul class="space-y-1 text-xs break-all">
            <li v-for="item in fetchSessionSummary" :key="item">{{ item }}</li>
          </ul>
        </div>
      <div v-if="fetchHtmlPreviewSummary.length > 0" class="rounded-xl border border-border/50 bg-muted/20 p-4">
          <p class="text-xs text-muted-foreground mb-2">Fetch Preview</p>
          <ul class="space-y-1 text-xs break-all">
            <li v-for="item in fetchHtmlPreviewSummary" :key="item">{{ item }}</li>
          </ul>
        </div>
      </div>
      <div v-if="fetchHtmlError" class="px-5 pb-5">
        <div class="rounded-xl border border-red-400/40 bg-red-500/5 p-4">
          <p class="text-xs text-red-700 dark:text-red-300 break-all">{{ fetchHtmlError }}</p>
        </div>
      </div>
      <div v-if="fetchHtmlPreview" class="px-5 pb-5">
        <textarea :value="fetchHtmlPreview.html" readonly class="w-full min-h-56 rounded-xl border border-border/50 bg-background px-4 py-3 text-xs font-mono" />
      </div>
    </section>

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

    <section class="mb-8 grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-4">
      <div class="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div class="p-5 border-b border-border/50 flex items-center justify-between">
          <div>
            <p class="text-sm font-medium">已导入源规则包</p>
            <p class="text-xs text-muted-foreground mt-1">选择一个已导入 package 进行调试</p>
          </div>
          <button class="h-8 px-3 text-xs rounded-full border bg-background hover:bg-muted transition-colors" :disabled="sourcePackagesLoading" @click="refreshPackages">
            {{ sourcePackagesLoading ? '刷新中...' : '刷新' }}
          </button>
        </div>
        <div class="p-5 space-y-3">
          <button
            v-for="item in sourcePackages"
            :key="item.sourceId"
            class="w-full text-left rounded-xl border border-border/50 bg-muted/20 p-4 hover:bg-muted/35 transition-colors"
            @click="selectPackage(item.sourceId)"
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
            <p class="text-xs text-muted-foreground mt-1">{{ sourceBuildPreviewSummary.sourceLabel }}</p>
          </div>
          <div class="flex items-center gap-3">
            <p v-if="sourcePackageDetailLoading" class="text-xs text-muted-foreground">
              规则包详情加载中...
            </p>
            <button
              class="h-9 px-4 rounded-full text-sm bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
              :disabled="sourcePackageImporting || !sourceBuildPreviewSummary.packageJson"
              @click="importPreviewPackage"
            >
              {{ sourcePackageImporting ? '导入中...' : '导入当前预览包' }}
            </button>
          </div>
        </div>
        <div class="p-5 space-y-4">
          <div class="rounded-xl border border-border/50 bg-muted/20 p-4">
            <p class="text-xs text-muted-foreground mb-1">packageId</p>
            <p class="text-sm font-medium break-all">{{ currentPreviewSummary.packageId }}</p>
            <p class="text-xs text-muted-foreground mt-2">校验: {{ currentPreviewSummary.validationLabel }}</p>
            <p class="text-xs text-muted-foreground mt-1">可导入: {{ currentPreviewSummary.importable ? '是' : '否' }}</p>
            <p class="text-xs text-muted-foreground mt-1">fetch: {{ fetchProfileSummary }}</p>
          </div>

          <div class="rounded-xl border border-border/50 bg-muted/20 p-4">
            <p class="text-xs text-muted-foreground mb-2">搜索策略</p>
            <div v-if="searchProfileSummary.length > 0" class="space-y-2">
              <div v-for="item in searchProfileSummary" :key="item.id" class="rounded-lg border border-border/40 bg-background p-3">
                <p class="text-xs font-medium">{{ item.id }} · {{ item.mode }}</p>
                <p class="text-xs text-muted-foreground mt-1">
                  enabled={{ item.enabled }} · priority={{ item.priority }} · provider={{ item.provider }}
                </p>
                <p class="text-xs text-muted-foreground mt-1 break-all">{{ item.note }}</p>
              </div>
            </div>
            <p v-else class="text-xs text-muted-foreground">当前 package 没有显式 searchProfile</p>
          </div>

          <div v-if="currentPreviewSummary.hasPreview" class="rounded-xl border border-border/50 bg-muted/20 p-4">
            <p class="text-xs text-muted-foreground mb-2">构建诊断</p>
            <ul class="space-y-1 text-xs break-all">
              <li v-for="item in currentDiagnosticsItems" :key="item">{{ item }}</li>
            </ul>
          </div>

          <textarea
            v-if="currentPackageJson"
            :value="currentPackageJson"
            readonly
            class="w-full min-h-52 rounded-xl border border-border/50 bg-background px-4 py-3 text-xs font-mono"
          />
        </div>
      </div>
    </section>

    <section class="mb-8 rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div class="p-5 border-b border-border/50">
        <p class="text-sm font-medium">Validate Package</p>
      </div>
      <div class="p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <input v-model="validateSearchQuery" class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm" placeholder="search query" />
        <input v-model="validateBookUrl" class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm" placeholder="book url" />
        <input v-model="validateTocUrl" class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm" placeholder="toc url" />
        <input v-model="validateChapterUrl" class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm" placeholder="chapter url" />
      </div>
      <div class="px-5 pb-5 flex justify-end">
        <button class="h-9 px-4 rounded-full text-sm bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50" :disabled="validationLoading || !currentPackage" @click="validateCurrentPackage">
          {{ validationLoading ? '验证中...' : '验证当前包' }}
        </button>
      </div>
      <div v-if="validationStepSummary.length > 0" class="px-5 pb-5">
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <div v-for="step in validationStepSummary" :key="step.step" class="rounded-xl border border-border/50 bg-muted/20 p-4">
            <p class="text-sm font-medium">{{ step.step }} · {{ step.ok ? '通过' : '失败' }}</p>
            <p class="text-xs text-muted-foreground mt-1">{{ step.summary }}</p>
            <p v-if="step.failureCode" class="text-xs text-muted-foreground mt-1">failure={{ step.failureCode }}</p>
            <p v-if="step.qualityScore != null" class="text-xs text-muted-foreground mt-1">quality={{ step.qualityScore }}</p>
            <ul v-if="step.warnings?.length" class="mt-2 space-y-1 text-xs text-amber-700 dark:text-amber-300">
              <li v-for="item in step.warnings" :key="item">{{ item }}</li>
            </ul>
            <ul v-if="step.errors?.length" class="mt-2 space-y-1 text-xs text-red-700 dark:text-red-300">
              <li v-for="item in step.errors" :key="item">{{ item }}</li>
            </ul>
            <ul v-if="step.suggestedActions?.length" class="mt-2 space-y-1 text-xs text-muted-foreground">
              <li v-for="item in step.suggestedActions" :key="item">{{ item }}</li>
            </ul>
          </div>
        </div>
      </div>
      <div v-if="fetchDebugSummary.length > 0" class="px-5 pb-5">
        <div class="rounded-xl border border-border/50 bg-muted/20 p-4">
          <p class="text-xs text-muted-foreground mb-2">Fetch Debug</p>
          <ul class="space-y-1 text-xs break-all">
            <li v-for="item in fetchDebugSummary" :key="item">{{ item }}</li>
          </ul>
        </div>
      </div>
      <div v-if="validationReport" class="px-5 pb-5">
        <pre class="w-full overflow-auto rounded-xl border border-border/50 bg-background p-4 text-xs">{{ JSON.stringify(validationReport, null, 2) }}</pre>
      </div>
    </section>

    <section class="mb-8 rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div class="p-5 border-b border-border/50">
        <p class="text-sm font-medium">Refine With Hints</p>
        <p class="text-xs text-muted-foreground mt-1">输入结构化提示或自由文本提示，让 AI 修正规则并重新验证。</p>
      </div>
      <div v-if="refineSuggestions.length > 0" class="p-5 border-b border-border/50">
        <p class="text-xs text-muted-foreground mb-3">Suggested Fixes</p>
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <div v-for="item in refineSuggestions" :key="item.id" class="rounded-xl border border-border/50 bg-muted/20 p-4">
            <p class="text-sm font-medium">{{ item.title }}</p>
            <p class="text-[11px] text-muted-foreground mt-1">step={{ item.step }} · type={{ item.kind }}</p>
            <p class="text-xs text-muted-foreground mt-2">{{ item.detail }}</p>
            <div class="mt-3 flex justify-end gap-2">
              <button class="h-8 px-3 rounded-full border bg-background hover:bg-muted text-xs" @click="applyRefineSuggestion(item)">
                {{ item.applyLabel }}
              </button>
              <button class="h-8 px-3 rounded-full bg-primary text-primary-foreground hover:opacity-90 text-xs disabled:opacity-50" :disabled="refineLoading || !currentPackage" @click="applyRefineSuggestionAndRefine(item)">
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
          @input="structuredHints.noisePatterns = String(($event.target as HTMLInputElement).value).split(',').map(item => item.trim()).filter(Boolean)"
        />
      </div>
      <div class="px-5 pb-5">
        <textarea v-model="freeTextHints" class="w-full min-h-32 rounded-xl border border-border/50 bg-background px-4 py-3 text-xs font-mono" placeholder="自由文本提示，例如：content selector: #txtcontent" />
      </div>
      <div class="px-5 pb-5 flex items-center justify-between gap-3">
        <div class="text-xs text-muted-foreground">
          <span v-if="refineAutoActions.length > 0">自动修正: {{ refineAutoActions.join(' | ') }}</span>
          <br v-if="refineAutoActions.length > 0 && refineAppliedHints.length > 0" />
          <span v-if="refineAppliedHints.length > 0">已应用: {{ refineAppliedHints.join(' | ') }}</span>
        </div>
        <button class="h-9 px-4 rounded-full text-sm bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50" :disabled="refineLoading || !currentPackage" @click="refineCurrentPackage">
          {{ refineLoading ? '修正中...' : '根据提示修正规则' }}
        </button>
      </div>
      <div v-if="refineChanges.length > 0" class="px-5 pb-5">
        <div class="rounded-xl border border-border/50 bg-muted/20 p-4">
          <p class="text-xs text-muted-foreground mb-3">Refine Diff</p>
          <div class="space-y-3">
            <div v-for="change in refineChanges" :key="change.path" class="rounded-lg border border-border/40 bg-background p-3">
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

    <section class="mb-8 rounded-2xl border border-border/50 bg-card overflow-hidden">
      <div class="p-5 border-b border-border/50">
        <p class="text-sm font-medium">Run By Package</p>
      </div>
      <div class="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
        <input v-model="runSearchQuery" class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm" placeholder="search query" />
        <input v-model="runTargetUrl" class="h-10 rounded-xl border border-border/50 bg-background px-3 text-sm" placeholder="target url" />
      </div>
      <div class="px-5 pb-5 flex flex-wrap gap-2">
        <button class="h-9 px-4 rounded-full border bg-background hover:bg-muted text-sm disabled:opacity-50" :disabled="runLoading || !currentPackage || !runSearchQuery.trim()" @click="runOperation('search')">Run Search</button>
        <button class="h-9 px-4 rounded-full border bg-background hover:bg-muted text-sm disabled:opacity-50" :disabled="runLoading || !currentPackage || !runTargetUrl.trim()" @click="runOperation('book_info')">Run Book Info</button>
        <button class="h-9 px-4 rounded-full border bg-background hover:bg-muted text-sm disabled:opacity-50" :disabled="runLoading || !currentPackage || !runTargetUrl.trim()" @click="runOperation('chapters')">Run Chapters</button>
        <button class="h-9 px-4 rounded-full border bg-background hover:bg-muted text-sm disabled:opacity-50" :disabled="runLoading || !currentPackage || !runTargetUrl.trim()" @click="runOperation('content')">Run Content</button>
      </div>
      <div v-if="runResult" class="px-5 pb-5">
        <pre class="w-full overflow-auto rounded-xl border border-border/50 bg-background p-4 text-xs">{{ JSON.stringify(runResult, null, 2) }}</pre>
      </div>
    </section>
  </main>
</template>
