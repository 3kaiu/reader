import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useMessage } from '@/composables/useMessage'
import { useSettingsStore } from '@/stores/settings'
import {
  useSourceBuilderDebugSnapshots,
} from '@/composables/source-builder/useSourceBuilderDebugSnapshots'
import { useSourceBuilderFetchSession } from '@/composables/source-builder/useSourceBuilderFetchSession'
import { useSourceBuilderRunOperations } from '@/composables/source-builder/useSourceBuilderRunOperations'
import { useSourceBuilderSummaries } from '@/composables/source-builder/useSourceBuilderSummaries'
import { useSourceBuilderValidationRefine } from '@/composables/source-builder/useSourceBuilderValidationRefine'
import { useSourceBuilderRuntimeGovernance } from '@/composables/source-builder/useSourceBuilderRuntimeGovernance'
import { useSourceBuilderDebugViewEffects } from '@/composables/source-builder/useSourceBuilderDebugViewEffects'
import {
  buildSourceBuilderFromSamples,
  clearSourceBuilderPreview,
  importSourceBuilderPreviewPackage,
  refreshSourceBuilderPackages,
  selectSourceBuilderPackage,
} from '@/composables/source-builder/sourceBuilderDebugViewActions'
import type { SourceBuilderDebugSnapshot } from '@/composables/source-builder/types'
import {
  type NxsSourcePackageDetail,
  type SourceBuildDiagnostics,
  type SourceFetchDebugInfo,
} from '@/api/sync'

export function useSourceBuilderDebugView() {
  const router = useRouter()
  const { success, warning } = useMessage()
  const settingsStore = useSettingsStore()
  const {
    sourcePackagesLoading,
    sourcePackageImporting,
    sourcePackageDetailLoading,
    sourceBuildRunning,
    sourcePackages,
    sourcePackageDetail,
    sourceBuildPreview,
    sourceBuildPreviewSummary,
  } = storeToRefs(settingsStore)

  const bookCurl = ref('')
  const chapterCurl = ref('')
  const searchCurl = ref('')
  const siteEntryCurl = ref('')
  const searchKeyword = ref('')
  const sourceId = ref('')
  const sourceName = ref('')
  const tagsText = ref('')
  const fetchMode = ref('external')
  const fetchProvider = ref('jina_reader')
  const fetchServiceUrl = ref('')
  const fetchEngine = ref('markdown')
  const lastFetchDebug = ref<SourceFetchDebugInfo | null>(null)
  const previewPackage = ref<NxsSourcePackageDetail | null>(null)
  const previewPackageJson = ref('')
  const previewDiagnostics = ref<SourceBuildDiagnostics | null>(null)
  const restoredDebugSnapshot = ref<SourceBuilderDebugSnapshot | null>(null)
  const {
    debugSnapshots,
    debugSnapshotSummary,
    loadDebugSnapshots,
    pushDebugSnapshot,
    restoreDebugSnapshot,
    clearDebugSnapshots,
  } = useSourceBuilderDebugSnapshots({
    onRestore(snapshot: SourceBuilderDebugSnapshot) {
      if (snapshot.bookCurl != null) {
        bookCurl.value = snapshot.bookCurl
      }
      if (snapshot.chapterCurl != null) {
        chapterCurl.value = snapshot.chapterCurl
      }
      if (snapshot.searchCurl != null) {
        searchCurl.value = snapshot.searchCurl
      }
      if (snapshot.searchKeyword != null) {
        searchKeyword.value = snapshot.searchKeyword
      }
      previewPackage.value = snapshot.packageData ?? null
      previewPackageJson.value = snapshot.packageJson ?? ''
      previewDiagnostics.value = snapshot.diagnostics ?? null
      restoredDebugSnapshot.value = snapshot
    },
  })

  const currentPackage = computed(
    () => previewPackage.value || sourcePackageDetail.value || null
  )
  const currentPackageJson = computed(
    () => previewPackageJson.value || sourceBuildPreviewSummary.value.packageJson || ''
  )
  const {
    runtimeGovernanceLoading,
    runtimeGovernanceActionLoading,
    currentRuntimeSourceId,
    currentRuntimeSourceHealth,
    currentRuntimeGovernanceSummary,
    runtimeOverviewSummary,
    runtimeGovernanceSuggestions,
    refreshRuntimeGovernance,
    saveRuntimeSnapshot,
    exportRuntimeSnapshot,
    importRuntimeSnapshot,
    resetCurrentRuntimeState,
  } = useSourceBuilderRuntimeGovernance({
    currentPackage,
    sourceId,
  })
  const fetchSessionState = useSourceBuilderFetchSession({
    currentPackage,
    currentPackageJson,
    previewDiagnostics,
    getValidationReport: () => validationReport.value,
    fetchMode,
    fetchProvider,
    fetchServiceUrl,
    fetchEngine,
    pushDebugSnapshot,
  })
  const {
    fetchSessionKey,
    sessionCookiesText,
    sessionHeadersText,
    sessionLabel,
    sessionTtlSeconds,
    sessionLoading,
    currentFetchSession,
    fetchHtmlPreview,
    rawFetchHtmlPreview,
    fetchHtmlViewMode,
    fetchHtmlUrl,
    fetchHtmlMethod,
    fetchHtmlBody,
    fetchHtmlForceRefresh,
    fetchHtmlLoading,
    fetchHtmlError,
    fetchSessionSummary,
    fetchHtmlPreviewSummary,
    rawFetchHtmlPreviewSummary,
    fetchHtmlCompareSummary,
    importFetchSession,
    loadFetchSession,
    previewFetchHtml,
    clearFetchState,
  } = fetchSessionState
  const runOperations = useSourceBuilderRunOperations({
    currentPackage,
    lastFetchDebug,
  })
  const {
    runSearchQuery,
    runTargetUrl,
    runResult,
    runSearchDetailResult,
    runChaptersResult,
    runLoading,
    runExecutionProfileSummary,
    runSearchResultItems,
    runSummary,
    runSuggestedActions,
    runSearchDetailSummary,
    runSearchDetailSuggestedActions,
    runChapterResultItems,
    runChaptersSummary,
    runChaptersSuggestedActions,
    runOperation,
    runSearchAndValidateDetail,
    runDetailValidation,
    runDetailAndChaptersValidation,
    clearRunState,
  } = runOperations
  const validationRefine = useSourceBuilderValidationRefine({
    currentPackage,
    currentPackageJson,
    previewPackage,
    previewPackageJson,
    previewDiagnostics,
    fetchMode,
    fetchProvider,
    fetchSessionKey,
    fetchHtmlPreview,
    lastFetchDebug,
    buildSnapshotContext: () => ({
      sourceLabel: previewPackage.value
        ? `${previewPackage.value.source.name} (${previewPackage.value.source.id})`
        : currentPackage.value
          ? `${currentPackage.value.source.name} (${currentPackage.value.source.id})`
          : undefined,
      sessionKey: fetchSessionKey.value.trim() || undefined,
      bookCurl: bookCurl.value,
      chapterCurl: chapterCurl.value,
      searchCurl: searchCurl.value,
      searchKeyword: searchKeyword.value,
    }),
    pushDebugSnapshot,
  })
  const {
    validateSearchQuery,
    validateBookUrl,
    validateTocUrl,
    validateChapterUrl,
    validationReport,
    validationLoading,
    structuredHints,
    freeTextHints,
    refineLoading,
    refineAutoActions,
    refineAppliedHints,
    refineChanges,
    validationStepSummary,
    refineSuggestions,
    validateCurrentPackage,
    applyRefineSuggestion,
    applyRefineSuggestionAndRefine,
    refineCurrentPackage,
    hasStructuredHints,
    applySnapshot: applyValidationSnapshot,
    clearValidationRefineState,
  } = validationRefine

  const { previewDiagnosticsItems } = useSourceBuilderDebugViewEffects({
    restoredDebugSnapshot,
    applyValidationSnapshot,
    applyFetchSnapshot: fetchSessionState.applySnapshot,
    lastFetchDebug,
    currentPackage,
    sourceBuildPreview,
    previewPackage,
    previewPackageJson,
    previewDiagnostics,
    validateBookUrl,
    validateChapterUrl,
    runTargetUrl,
    fetchHtmlUrl,
    runSearchQuery,
    searchKeyword,
    sourceBuildPreviewSummary,
  })
  const {
    currentDiagnosticsItems,
    currentPreviewSummary,
    fetchDebugSummary,
    searchProfileSummary,
    fetchProfileSummary,
  } = useSourceBuilderSummaries({
    currentPackage,
    previewDiagnostics,
    sourceBuildPreviewDiagnosticsItems: previewDiagnosticsItems,
    lastFetchDebug,
  })

  async function refreshPackages() {
    await refreshSourceBuilderPackages({
      refreshRuntimeGovernance,
      refreshSourcePackages: settingsStore.refreshSourcePackages,
    })
  }

  async function buildFromSamples() {
    await buildSourceBuilderFromSamples({
      settingsStore,
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
      structuredHints,
      hasStructuredHints,
      freeTextHints,
      previewPackage,
      previewPackageJson,
      previewDiagnostics,
      validationReport,
      lastFetchDebug,
      fetchHtmlPreview,
      pushDebugSnapshot,
      success,
      warning,
    })
  }

  async function importPreviewPackage() {
    await importSourceBuilderPreviewPackage({
      currentPackage,
      currentPackageJson,
      importSourcePackage: settingsStore.importSourcePackage,
      refreshPackages,
      success,
      warning,
    })
  }

  async function selectPackage(sourceId: string) {
    await selectSourceBuilderPackage({
      sourceId,
      loadSourcePackageDetail: settingsStore.loadSourcePackageDetail,
    })
  }

  function clearPreview() {
    clearSourceBuilderPreview({
      clearSourceBuildPreview: settingsStore.clearSourceBuildPreview,
      previewPackage,
      previewPackageJson,
      previewDiagnostics,
      runResult,
      runSearchDetailResult,
      runChaptersResult,
      lastFetchDebug,
      clearFetchState,
      clearRunState,
      clearValidationRefineState,
    })
  }

  function goBack() {
    void router.push('/settings')
  }

  onMounted(async () => {
    loadDebugSnapshots()
    await refreshPackages()
  })

  return {
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
    currentRuntimeSourceHealth,
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
    currentFetchSession,
    fetchSessionSummary,
    fetchHtmlPreview,
    fetchHtmlPreviewSummary,
    rawFetchHtmlPreview,
    rawFetchHtmlPreviewSummary,
    fetchHtmlCompareSummary,
    fetchHtmlViewMode,
    debugSnapshots,
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
    importFetchSession: () => importFetchSession(lastFetchDebug),
    loadFetchSession,
    previewFetchHtml: () => previewFetchHtml(lastFetchDebug),
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
    refineCurrentPackage,
    runOperation,
    runSearchAndValidateDetail,
    runDetailValidation,
    runDetailAndChaptersValidation,
    clearPreview,
    goBack,
  }
}
