import { onMounted, ref } from 'vue'
import { useStorage } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useMessage } from '@/composables/useMessage'
import { useSettingsStore } from '@/stores/settings'
import { useSourceBuilderDebugFormState } from '@/composables/source-builder/useSourceBuilderDebugFormState'
import { useSourceBuilderPreviewState } from '@/composables/source-builder/useSourceBuilderPreviewState'
import {
  useSourceBuilderDebugSnapshots,
} from '@/composables/source-builder/useSourceBuilderDebugSnapshots'
import { useSourceBuilderDebugPageActions } from '@/composables/source-builder/useSourceBuilderDebugPageActions'
import { useSourceBuilderFetchSession } from '@/composables/source-builder/useSourceBuilderFetchSession'
import { useSourceBuilderRunOperations } from '@/composables/source-builder/useSourceBuilderRunOperations'
import { useSourceBuilderSummaries } from '@/composables/source-builder/useSourceBuilderSummaries'
import { useSourceBuilderValidationRefine } from '@/composables/source-builder/useSourceBuilderValidationRefine'
import { useSourceBuilderRuntimeGovernance } from '@/composables/source-builder/useSourceBuilderRuntimeGovernance'
import { useSourceBuilderDebugViewEffects } from '@/composables/source-builder/useSourceBuilderDebugViewEffects'

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

  const {
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
  } = useSourceBuilderDebugFormState()
  const {
    lastFetchDebug,
    previewPackage,
    previewPackageJson,
    previewDiagnostics,
    restoredDebugSnapshot,
    currentPackage,
    currentPackageJson,
    applyDebugSnapshot,
  } = useSourceBuilderPreviewState({
    sourcePackageDetail,
    sourceBuildPreviewSummary,
    bookCurl,
    chapterCurl,
    searchCurl,
    searchKeyword,
  })
  const {
    debugSnapshots,
    debugSnapshotSummary,
    loadDebugSnapshots,
    pushDebugSnapshot,
    restoreDebugSnapshot,
    clearDebugSnapshots,
  } = useSourceBuilderDebugSnapshots({
    onRestore: applyDebugSnapshot,
  })
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
    searchKeyword,
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
    aiAssistLoading,
    aiAssistSummary,
    aiAssistOpsLeaderboard,
    aiAssistOpsRegressionTop,
    aiAssistOpsRecommendedActions,
    validationStepSummary,
    refineSuggestions,
    requestAiAssist,
    requestAiAssistAndRefine,
    setAiAssistRunId,
    applyRecommendedAction,
    applyRecommendedActionAndRefine,
    validateCurrentPackage,
    applyRefineSuggestion,
    applyRefineSuggestionAndRefine,
    refineCurrentPackage,
    hasStructuredHints,
    applySnapshot: applyValidationSnapshot,
    clearValidationRefineState,
  } = validationRefine

  type AutoFlowState =
    | 'IDLE'
    | 'BUILDING'
    | 'VALIDATING'
    | 'AI_REFINE_ATTEMPT'
    | 'REVALIDATING'
    | 'ROLLBACK'
    | 'CONSERVATIVE_RETRY'
    | 'MANUAL_REQUIRED'
    | 'QUARANTINED'
    | 'IMPORT_READY'
  const autoFlowState = ref<AutoFlowState>('IDLE')
  const autoFlowRunId = ref('')
  const autoFlowSummary = ref<string[]>([])
  const sourceFailureCounts = useStorage<Record<string, number>>(
    'source-builder-auto-failure-counts',
    {}
  )
  const AUTO_FLOW_MAX_ATTEMPTS = 3
  const SCORE_MIN = 0.75
  const SEGMENT_MIN = {
    search: 0.7,
    book: 0.7,
    toc: 0.68,
    content: 0.7,
  } as const
  const BLOCKING_FAILURE_CODES = new Set([
    'fetch_failed',
    'compile_failed',
    'detail_cross_site',
  ])

  function nextRunId() {
    return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  }

  function evaluateImportGate() {
    const pkg = currentPackage.value
    if (!pkg) {
      return { pass: false, reasons: ['规则包为空'] }
    }

    const reasons: string[] = []
    const score = Number(pkg.validation?.score ?? 0)
    if (score + 1e-9 < SCORE_MIN) {
      reasons.push(`overall<${Math.round(SCORE_MIN * 100)} (${Math.round(score * 100)})`)
    }

    const health = pkg.validation?.health
    const segmentScore = {
      search: Number(health?.search?.qualityScore ?? 0),
      book: Number(health?.book?.qualityScore ?? 0),
      toc: Number(health?.toc?.qualityScore ?? 0),
      content: Number(health?.content?.qualityScore ?? 0),
    }
    for (const [segment, minScore] of Object.entries(SEGMENT_MIN) as Array<
      [keyof typeof SEGMENT_MIN, number]
    >) {
      if (segmentScore[segment] + 1e-9 < minScore) {
        reasons.push(`${segment}<${Math.round(minScore * 100)} (${Math.round(segmentScore[segment] * 100)})`)
      }
    }

    const steps = pkg.validation?.steps ?? []
    for (const step of steps) {
      const code = String(step.failureCode || '').trim()
      if (!code) continue
      if (BLOCKING_FAILURE_CODES.has(code)) {
        reasons.push(`blocking:${code}`)
      }
      if (
        code === 'empty_result' &&
        (step.step === 'chapters' || step.step === 'content')
      ) {
        reasons.push(`blocking:${step.step}:empty_result`)
      }
    }

    if (!pkg.validation?.importable) {
      reasons.push('validation.importable=false')
    }

    return { pass: reasons.length === 0, reasons }
  }

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
  const {
    refreshPackages,
    buildFromSamples,
    importPreviewPackage,
    selectPackage,
    clearPreview,
    goBack,
  } = useSourceBuilderDebugPageActions({
    router,
    refreshSourcePackages: settingsStore.refreshSourcePackages,
    refreshRuntimeGovernance,
    buildFromSamplesOptions: {
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
    },
    importPreviewOptions: {
      currentPackage,
      currentPackageJson,
      importSourcePackage: settingsStore.importSourcePackage,
      success,
      warning,
    },
    selectPackageOptions: {
      loadSourcePackageDetail: settingsStore.loadSourcePackageDetail,
    },
    clearPreviewOptions: {
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
    },
  })

  async function buildValidateAndAutoRefine() {
    const runId = nextRunId()
    autoFlowRunId.value = runId
    setAiAssistRunId(runId)
    autoFlowSummary.value = [`runId=${runId}`]

    const sourceIdForCounter = currentPackage.value?.source.id || sourceId.value.trim() || 'unknown'
    const failureCount = sourceFailureCounts.value[sourceIdForCounter] || 0
    if (failureCount >= 3) {
      autoFlowState.value = 'QUARANTINED'
      warning('该 source 已进入隔离状态，请手工修正样本后再试')
      autoFlowSummary.value.push(`state=QUARANTINED failureCount=${failureCount}`)
      return
    }

    autoFlowState.value = 'BUILDING'
    const built = await buildFromSamples()
    if (!built || !currentPackage.value) {
      autoFlowState.value = 'MANUAL_REQUIRED'
      warning('未生成可用规则包，无法继续自动流程')
      autoFlowSummary.value.push('state=MANUAL_REQUIRED reason=build_failed')
      return
    }

    autoFlowState.value = 'VALIDATING'
    if (!validateSearchQuery.value.trim() && searchKeyword.value.trim()) {
      validateSearchQuery.value = searchKeyword.value.trim()
    }
    await validateCurrentPackage()

    let gate = evaluateImportGate()
    autoFlowSummary.value.push(`gate@validate=${gate.pass ? 'pass' : `fail(${gate.reasons.join(', ')})`}`)
    if (gate.pass) {
      autoFlowState.value = 'IMPORT_READY'
      sourceFailureCounts.value = {
        ...sourceFailureCounts.value,
        [sourceIdForCounter]: 0,
      }
      success('规则包已达导入门槛，可直接导入')
      return
    }

    for (let attempt = 1; attempt <= AUTO_FLOW_MAX_ATTEMPTS; attempt++) {
      autoFlowState.value = 'AI_REFINE_ATTEMPT'
      autoFlowSummary.value.push(`attempt=${attempt} action=ai_refine`)
      await requestAiAssistAndRefine()

      autoFlowState.value = 'REVALIDATING'
      gate = evaluateImportGate()
      autoFlowSummary.value.push(
        `gate@attempt${attempt}=${gate.pass ? 'pass' : `fail(${gate.reasons.join(', ')})`}`
      )
      if (gate.pass) {
        autoFlowState.value = 'IMPORT_READY'
        sourceFailureCounts.value = {
          ...sourceFailureCounts.value,
          [sourceIdForCounter]: 0,
        }
        success('自动修正达标，可导入规则包')
        return
      }

      if (attempt < AUTO_FLOW_MAX_ATTEMPTS) {
        autoFlowState.value = 'CONSERVATIVE_RETRY'
        warning(`第 ${attempt} 次自动修正未达标，已切换保守重试`)
      } else {
        autoFlowState.value = 'ROLLBACK'
      }
    }

    const nextFailureCount = (sourceFailureCounts.value[sourceIdForCounter] || 0) + 1
    sourceFailureCounts.value = {
      ...sourceFailureCounts.value,
      [sourceIdForCounter]: nextFailureCount,
    }
    if (nextFailureCount >= 3) {
      autoFlowState.value = 'QUARANTINED'
      warning('连续失败达到阈值，已进入隔离状态')
      autoFlowSummary.value.push(`state=QUARANTINED failureCount=${nextFailureCount}`)
      return
    }

    autoFlowState.value = 'MANUAL_REQUIRED'
    warning('自动修正未达导入门槛，请手工补样本或调整规则')
    autoFlowSummary.value.push(`state=MANUAL_REQUIRED failureCount=${nextFailureCount}`)
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
    autoFlowState,
    autoFlowRunId,
    autoFlowSummary,
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
    buildValidateAndAutoRefine,
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
    requestAiAssist,
    requestAiAssistAndRefine,
    applyRecommendedAction,
    applyRecommendedActionAndRefine,
    refineCurrentPackage,
    runOperation,
    runSearchAndValidateDetail,
    runDetailValidation,
    runDetailAndChaptersValidation,
    clearPreview,
    goBack,
  }
}
