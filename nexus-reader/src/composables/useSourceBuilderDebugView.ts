import { computed, onMounted, ref } from 'vue'
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
import {
  recoverSourceSessionProfile,
  requestAutoAcquireFetchSession,
  requestSourceSessionProfile,
  requestSourceFlowAssistProfileAudit,
  requestSourceFlowAssistProfile,
  requestVerifyFetchSession,
  resetSourceFlowAssistProfile,
} from '@/composables/source-builder/sourceBuilderValidationActions'

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
    runContentResult,
    runFullFlowSummary,
    runContentSmokeSummary,
    runContentSmokeFailures,
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
    runContentSummary,
    runContentSuggestedActions,
    runOperation,
    runSearchAndValidateDetail,
    runDetailValidation,
    runDetailAndChaptersValidation,
    runSearchToContentValidation,
    runChaptersContentSmoke,
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
    | 'E2E_VERIFY'
    | 'SMOKE_VERIFY'
    | 'MANUAL_REQUIRED'
    | 'QUARANTINED'
    | 'IMPORT_READY'
  type AutoFlowHistoryEntry = {
    id: string
    runId: string
    sourceId: string
    finalState: AutoFlowState
    success: boolean
    note: string
    createdAtMs: number
  }
  type ForcedImportAuditEntry = {
    id: string
    sourceId: string
    reason: string
    createdAtMs: number
  }
  const autoFlowState = ref<AutoFlowState>('IDLE')
  const autoFlowRunId = ref('')
  const autoFlowSummary = ref<string[]>([])
  const autoFlowHistory = useStorage<AutoFlowHistoryEntry[]>(
    'source-builder-auto-flow-history',
    []
  )
  const forcedImportAudit = useStorage<ForcedImportAuditEntry[]>(
    'source-builder-forced-import-audit',
    []
  )
  const currentAutoFlowSourceId = computed(
    () => currentPackage.value?.source.id || sourceId.value.trim() || ''
  )
  const autoFlowHistorySummary = computed(() =>
    autoFlowHistory.value.map(item => ({
      id: item.id,
      title: `${item.success ? 'PASS' : 'FAIL'} · ${item.finalState} · ${item.sourceId || '--'}`,
      subtitle: `${item.runId} · ${new Date(item.createdAtMs).toLocaleString()}`,
      note: item.note,
    }))
  )
  const currentSourceAutoFlowHistorySummary = computed(() => {
    const source = currentAutoFlowSourceId.value
    const entries = source
      ? autoFlowHistory.value.filter(item => item.sourceId === source)
      : autoFlowHistory.value
    return entries.map(item => ({
      id: item.id,
      title: `${item.success ? 'PASS' : 'FAIL'} · ${item.finalState} · ${item.sourceId || '--'}`,
      subtitle: `${item.runId} · ${new Date(item.createdAtMs).toLocaleString()}`,
      note: item.note,
    }))
  })
  const currentSourceAutoFlowStats = computed(() => {
    const source = currentAutoFlowSourceId.value
    const entries = autoFlowHistory.value.filter(item => !source || item.sourceId === source)
    const total = entries.length
    const passed = entries.filter(item => item.success).length
    const failed = total - passed
    const passRate = total > 0 ? Math.round((passed / total) * 100) : 0
    return {
      sourceId: source || '--',
      total,
      passed,
      failed,
      passRate,
    }
  })
  const currentSourceAutoFlowStreak = computed(() => {
    const source = currentAutoFlowSourceId.value
    const entries = (source
      ? autoFlowHistory.value.filter(item => item.sourceId === source)
      : autoFlowHistory.value
    ).slice(0, 30)
    let passStreak = 0
    let failStreak = 0
    let latestOutcome: 'pass' | 'fail' | 'none' = 'none'
    if (entries.length > 0) {
      latestOutcome = entries[0].success ? 'pass' : 'fail'
      for (const entry of entries) {
        if (entry.success) {
          if (failStreak > 0) break
          passStreak += 1
        } else {
          if (passStreak > 0) break
          failStreak += 1
        }
      }
    }
    return {
      latestOutcome,
      passStreak,
      failStreak,
    }
  })
  const currentSourceAutoFlowRecommendation = computed(() => {
    const source = currentAutoFlowSourceId.value
    const failureCount = source ? Number(sourceFailureCounts.value[source] || 0) : 0
    const stats = currentSourceAutoFlowStats.value
    const streak = currentSourceAutoFlowStreak.value
    if (!source) {
      return {
        level: 'unknown' as const,
        title: '未选择 source',
        advice: '先选择或构建一个 source，再运行自动流程评估稳定性。',
      }
    }
    if (failureCount >= 3 || autoFlowState.value === 'QUARANTINED') {
      return {
        level: 'risky' as const,
        title: '高风险：源已接近或进入隔离',
        advice: '建议先“解封 Source 状态”或“重置为新源”，补样本后再跑自动流程。',
      }
    }
    if (stats.total < 3) {
      return {
        level: 'watch' as const,
        title: '样本不足：结论不稳定',
        advice: '至少累积 3 次以上自动流程结果，再依据通过率决策是否导入。',
      }
    }
    if (stats.passRate >= 80 && streak.failStreak === 0) {
      return {
        level: 'stable' as const,
        title: '稳定：可继续导入验证',
        advice: '当前源通过率较高，可继续执行导入并验证真实阅读链路。',
      }
    }
    if (stats.passRate >= 50) {
      return {
        level: 'watch' as const,
        title: '边缘稳定：建议保守迭代',
        advice: '优先提高 smoke sample 或提高门禁阈值，逐步收敛规则改动范围。',
      }
    }
    return {
      level: 'risky' as const,
      title: '不稳定：暂不建议导入',
      advice: '通过率过低，建议先重置状态并补齐搜索/详情/目录样本后重试。',
    }
  })
  const currentSourceAutoFlowHealthSummary = computed(() => {
    const source = currentAutoFlowSourceId.value
    const stats = currentSourceAutoFlowStats.value
    const streak = currentSourceAutoFlowStreak.value
    const failureCount = source ? Number(sourceFailureCounts.value[source] || 0) : 0
    const gateSampleSize = runSmokeSampleSize.value
    const gatePassRate = runSmokePassRateThreshold.value
    let score = stats.passRate
    score -= Math.min(40, failureCount * 10)
    score -= Math.min(35, streak.failStreak * 12)
    if (stats.total < 3) score -= 20
    score = Math.max(0, Math.min(100, Math.round(score)))
    const grade = score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : 'D'
    return [
      `health=${score}/100 (${grade})`,
      `gate=sample${gateSampleSize}/passRate${gatePassRate}%`,
      `recentStreak=pass${streak.passStreak}/fail${streak.failStreak}`,
      `failureCounter=${failureCount}`,
    ]
  })
  const importPreviewGuard = computed(() => {
    const source = currentAutoFlowSourceId.value
    const stats = currentSourceAutoFlowStats.value
    const streak = currentSourceAutoFlowStreak.value
    const recommendation = currentSourceAutoFlowRecommendation.value
    const failureCount = source ? Number(sourceFailureCounts.value[source] || 0) : 0
    const reasons: string[] = []
    const actions: string[] = []

    if (!source) {
      return {
        blocked: false,
        reasons,
        actions,
      }
    }

    if (recommendation.level === 'risky') {
      reasons.push(`stability=${recommendation.level}`)
    }
    if (autoFlowState.value === 'QUARANTINED' || failureCount >= 3) {
      reasons.push(`source_state=QUARANTINED(${failureCount})`)
    }
    if (streak.failStreak >= 2) {
      reasons.push(`recent_fail_streak=${streak.failStreak}`)
    }

    if (reasons.length > 0) {
      actions.push('先执行“按建议设置”或“严格门禁”收紧 smoke gate')
      actions.push('重新执行“一键封装并验证并自动修正”，至少得到 1 次 PASS')
      if (autoFlowState.value === 'QUARANTINED' || failureCount >= 3) {
        actions.push('先点击“解封 Source 状态”再重跑自动流程')
      }
      actions.push(`参考当前统计: passRate=${stats.passRate}% total=${stats.total}`)
    }

    return {
      blocked: reasons.length > 0,
      reasons,
      actions,
    }
  })
  const importPreviewGuardSummary = computed(() => {
    if (!importPreviewGuard.value.blocked) return []
    return [
      `导入阻断: ${importPreviewGuard.value.reasons.join(', ')}`,
      ...importPreviewGuard.value.actions,
    ]
  })
  const currentSourceForcedImportSummary = computed(() => {
    const source = currentAutoFlowSourceId.value
    const entries = forcedImportAudit.value.filter(item => !source || item.sourceId === source)
    const recent24h = entries.filter(item => Date.now() - item.createdAtMs <= 24 * 60 * 60 * 1000)
    const latest = entries[0]
    const lines = [
      `forcedImport24h=${recent24h.length}`,
      `forcedImportTotal=${entries.length}`,
    ]
    if (latest) {
      lines.push(`lastForcedImport=${new Date(latest.createdAtMs).toLocaleString()}`)
      lines.push(`lastForcedReason=${latest.reason}`)
    }
    return lines
  })
  const forceImportArmed = ref(false)
  const sourceFailureCounts = useStorage<Record<string, number>>(
    'source-builder-auto-failure-counts',
    {}
  )
  const sourceLastGoodPackages = useStorage<
    Record<
      string,
      {
        packageId: string
        sourceName: string
        packageJson: string
        updatedAtMs: number
        validationScore: number
      }
    >
  >('source-builder-last-good-packages', {})
  const AUTO_FLOW_MAX_ATTEMPTS = 3
  const sourceSmokeGateConfigs = useStorage<
    Record<string, { sampleSize: number; passRateThreshold: number }>
  >('source-builder-run-smoke-configs-by-source', {})
  const DEFAULT_SMOKE_SAMPLE_SIZE = 10
  const DEFAULT_SMOKE_PASS_RATE_THRESHOLD = 80
  const FALLBACK_SOURCE_KEY = '__default__'
  const runSmokeSampleSize = computed({
    get: () => {
      const key = currentAutoFlowSourceId.value || FALLBACK_SOURCE_KEY
      const config = sourceSmokeGateConfigs.value[key]
      return Number(config?.sampleSize || DEFAULT_SMOKE_SAMPLE_SIZE)
    },
    set: (value: number) => {
      const key = currentAutoFlowSourceId.value || FALLBACK_SOURCE_KEY
      const previous = sourceSmokeGateConfigs.value[key]
      const sampleSize = Math.max(1, Math.min(30, Math.trunc(Number(value) || DEFAULT_SMOKE_SAMPLE_SIZE)))
      const passRateThreshold = Math.max(
        1,
        Math.min(
          100,
          Math.trunc(Number(previous?.passRateThreshold || DEFAULT_SMOKE_PASS_RATE_THRESHOLD))
        )
      )
      sourceSmokeGateConfigs.value = {
        ...sourceSmokeGateConfigs.value,
        [key]: { sampleSize, passRateThreshold },
      }
    },
  })
  const runSmokePassRateThreshold = computed({
    get: () => {
      const key = currentAutoFlowSourceId.value || FALLBACK_SOURCE_KEY
      const config = sourceSmokeGateConfigs.value[key]
      return Number(config?.passRateThreshold || DEFAULT_SMOKE_PASS_RATE_THRESHOLD)
    },
    set: (value: number) => {
      const key = currentAutoFlowSourceId.value || FALLBACK_SOURCE_KEY
      const previous = sourceSmokeGateConfigs.value[key]
      const sampleSize = Math.max(
        1,
        Math.min(30, Math.trunc(Number(previous?.sampleSize || DEFAULT_SMOKE_SAMPLE_SIZE)))
      )
      const passRateThreshold = Math.max(
        1,
        Math.min(100, Math.trunc(Number(value) || DEFAULT_SMOKE_PASS_RATE_THRESHOLD))
      )
      sourceSmokeGateConfigs.value = {
        ...sourceSmokeGateConfigs.value,
        [key]: { sampleSize, passRateThreshold },
      }
    },
  })
  const sourceFlowProfileLoading = ref(false)
  const sourceFlowProfileSummary = ref<string[]>([])
  const sourceFlowProfileAuditSummary = ref<string[]>([])
  const sourceSessionProfileLoading = ref(false)
  const sourceSessionProfileSummary = ref<string[]>([])
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

  function latestGateNote(): string {
    const gateLines = autoFlowSummary.value.filter(item => item.startsWith('gate@'))
    return gateLines.length > 0 ? gateLines[gateLines.length - 1] : '--'
  }

  function pushAutoFlowHistory(options: {
    runId: string
    sourceId: string
    finalState: AutoFlowState
    success: boolean
    note: string
  }) {
    const next: AutoFlowHistoryEntry = {
      id: `${options.runId}-${Date.now().toString(36)}`,
      runId: options.runId,
      sourceId: options.sourceId,
      finalState: options.finalState,
      success: options.success,
      note: options.note,
      createdAtMs: Date.now(),
    }
    autoFlowHistory.value = [next, ...autoFlowHistory.value].slice(0, 40)
  }

  function clearAutoFlowHistory(options?: { currentSourceOnly?: boolean }) {
    if (options?.currentSourceOnly) {
      const source = currentAutoFlowSourceId.value
      if (!source) {
        warning('缺少 sourceId，无法按当前源清理历史')
        return
      }
      autoFlowHistory.value = autoFlowHistory.value.filter(item => item.sourceId !== source)
      success(`已清理当前源历史: ${source}`)
      return
    }
    autoFlowHistory.value = []
    success('已清理全部自动流程历史')
  }

  function applySmokeGatePreset(preset: 'strict' | 'default') {
    if (preset === 'strict') {
      runSmokeSampleSize.value = 15
      runSmokePassRateThreshold.value = 90
      success('已应用严格门禁: sample=15, passRate=90%')
      return
    }
    runSmokeSampleSize.value = DEFAULT_SMOKE_SAMPLE_SIZE
    runSmokePassRateThreshold.value = DEFAULT_SMOKE_PASS_RATE_THRESHOLD
    success(`已恢复默认门禁: sample=${DEFAULT_SMOKE_SAMPLE_SIZE}, passRate=${DEFAULT_SMOKE_PASS_RATE_THRESHOLD}%`)
  }

  function applyRecommendedSmokeGate() {
    const recommendation = currentSourceAutoFlowRecommendation.value
    if (recommendation.level === 'risky') {
      runSmokeSampleSize.value = 15
      runSmokePassRateThreshold.value = 90
      success('已按风险建议应用严格门禁: sample=15, passRate=90%')
      return
    }
    if (recommendation.level === 'watch') {
      runSmokeSampleSize.value = 12
      runSmokePassRateThreshold.value = 85
      success('已按观察建议应用保守门禁: sample=12, passRate=85%')
      return
    }
    runSmokeSampleSize.value = DEFAULT_SMOKE_SAMPLE_SIZE
    runSmokePassRateThreshold.value = DEFAULT_SMOKE_PASS_RATE_THRESHOLD
    success(`稳定状态建议默认门禁: sample=${DEFAULT_SMOKE_SAMPLE_SIZE}, passRate=${DEFAULT_SMOKE_PASS_RATE_THRESHOLD}%`)
  }

  function persistLastGoodPackage(sourceIdForCounter: string) {
    const pkg = currentPackage.value
    if (!pkg || !sourceIdForCounter) return
    const packageJson = currentPackageJson.value || previewPackageJson.value
    if (!packageJson.trim()) return

    sourceLastGoodPackages.value = {
      ...sourceLastGoodPackages.value,
      [sourceIdForCounter]: {
        packageId: pkg.packageId,
        sourceName: pkg.source?.name || sourceIdForCounter,
        packageJson,
        updatedAtMs: Date.now(),
        validationScore: Number(pkg.validation?.score ?? 0),
      },
    }
    autoFlowSummary.value.push(
      `lastGood=saved ${pkg.packageId} score=${Math.round(Number(pkg.validation?.score ?? 0) * 100)}`
    )
  }

  function rollbackToLastGoodPackage(sourceIdForCounter: string): boolean {
    const record = sourceLastGoodPackages.value[sourceIdForCounter]
    if (!record?.packageJson) {
      autoFlowSummary.value.push('rollback=skipped reason=no_last_good')
      return false
    }

    try {
      const parsed = JSON.parse(record.packageJson)
      if (!parsed || typeof parsed !== 'object') {
        autoFlowSummary.value.push('rollback=failed reason=invalid_json')
        return false
      }
      previewPackage.value = parsed as typeof previewPackage.value
      previewPackageJson.value = record.packageJson
      validationReport.value = {
        packageId: record.packageId,
        report: (parsed as { validation?: unknown }).validation ?? null,
      }
      autoFlowSummary.value.push(
        `rollback=applied ${record.packageId} savedAt=${new Date(record.updatedAtMs).toLocaleString()}`
      )
      success(`已回滚到上一个可用包: ${record.sourceName} / ${record.packageId}`)
      return true
    } catch {
      autoFlowSummary.value.push('rollback=failed reason=parse_error')
      return false
    }
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
    importPreviewPackage: importPreviewPackageRaw,
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

  async function importPreviewPackage() {
    forceImportArmed.value = false
    if (importPreviewGuard.value.blocked) {
      const reasonText = importPreviewGuard.value.reasons.join(', ')
      warning(`已阻断导入: ${reasonText}`)
      autoFlowSummary.value = [
        ...autoFlowSummary.value,
        `import=blocked reason=${reasonText}`,
      ].slice(-50)
      return
    }
    await importPreviewPackageRaw()
  }

  async function forceImportPreviewPackage() {
    if (!importPreviewGuard.value.blocked) {
      forceImportArmed.value = false
      await importPreviewPackageRaw()
      return
    }
    if (!forceImportArmed.value) {
      forceImportArmed.value = true
      warning('再次点击“强制导入（仅调试）”以确认越过门禁')
      return
    }
    forceImportArmed.value = false
    const reasonText = importPreviewGuard.value.reasons.join(', ')
    autoFlowSummary.value = [
      ...autoFlowSummary.value,
      `import=forced reason=${reasonText}`,
    ].slice(-50)
    const source = currentAutoFlowSourceId.value || 'unknown'
    forcedImportAudit.value = [
      {
        id: `forced-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        sourceId: source,
        reason: reasonText,
        createdAtMs: Date.now(),
      },
      ...forcedImportAudit.value,
    ].slice(0, 80)
    warning(`已执行强制导入（仅调试）: ${reasonText}`)
    await importPreviewPackageRaw()
  }

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
      pushAutoFlowHistory({
        runId,
        sourceId: sourceIdForCounter,
        finalState: 'QUARANTINED',
        success: false,
        note: `precheck failureCount=${failureCount}`,
      })
      return
    }

    autoFlowState.value = 'BUILDING'
    const built = await buildFromSamples()
    if (!built || !currentPackage.value) {
      autoFlowState.value = 'MANUAL_REQUIRED'
      warning('未生成可用规则包，无法继续自动流程')
      autoFlowSummary.value.push('state=MANUAL_REQUIRED reason=build_failed')
      pushAutoFlowHistory({
        runId,
        sourceId: sourceIdForCounter,
        finalState: 'MANUAL_REQUIRED',
        success: false,
        note: 'build_failed',
      })
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
      autoFlowState.value = 'E2E_VERIFY'
      const e2e = await runSearchToContentValidation({
        query: validateSearchQuery.value.trim() || searchKeyword.value.trim(),
      })
      autoFlowSummary.value.push(`gate@e2e=${e2e.pass ? 'pass' : `fail(${e2e.reasons.join(', ')})`}`)
      if (!e2e.pass) {
        gate = { pass: false, reasons: e2e.reasons }
      } else {
        autoFlowState.value = 'SMOKE_VERIFY'
        const smoke = await runChaptersContentSmoke({
          sampleSize: runSmokeSampleSize.value,
          passRateThreshold: runSmokePassRateThreshold.value,
        })
        const smokeReasons = smoke.pass
          ? []
          : [`smoke_pass_rate=${smoke.passRate}%<${smoke.passRateThreshold}%`]
        autoFlowSummary.value.push(
          `gate@smoke=${smoke.pass ? 'pass' : `fail(${smokeReasons.join(', ')})`} sampled=${smoke.total}`
        )
        if (!smoke.pass) {
          gate = { pass: false, reasons: smokeReasons }
        }
      }
    }
    if (gate.pass) {
      autoFlowState.value = 'IMPORT_READY'
      persistLastGoodPackage(sourceIdForCounter)
      sourceFailureCounts.value = {
        ...sourceFailureCounts.value,
        [sourceIdForCounter]: 0,
      }
      success('规则包已达导入门槛，可直接导入')
      pushAutoFlowHistory({
        runId,
        sourceId: sourceIdForCounter,
        finalState: 'IMPORT_READY',
        success: true,
        note: latestGateNote(),
      })
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
        autoFlowState.value = 'E2E_VERIFY'
        const e2e = await runSearchToContentValidation({
          query: validateSearchQuery.value.trim() || searchKeyword.value.trim(),
        })
        autoFlowSummary.value.push(`gate@attempt${attempt}:e2e=${e2e.pass ? 'pass' : `fail(${e2e.reasons.join(', ')})`}`)
        if (!e2e.pass) {
          gate = { pass: false, reasons: e2e.reasons }
        } else {
          autoFlowState.value = 'SMOKE_VERIFY'
          const smoke = await runChaptersContentSmoke({
            sampleSize: runSmokeSampleSize.value,
            passRateThreshold: runSmokePassRateThreshold.value,
          })
          const smokeReasons = smoke.pass
            ? []
            : [`smoke_pass_rate=${smoke.passRate}%<${smoke.passRateThreshold}%`]
          autoFlowSummary.value.push(
            `gate@attempt${attempt}:smoke=${smoke.pass ? 'pass' : `fail(${smokeReasons.join(', ')})`} sampled=${smoke.total}`
          )
          if (!smoke.pass) {
            gate = { pass: false, reasons: smokeReasons }
          }
        }
      }
      if (gate.pass) {
        autoFlowState.value = 'IMPORT_READY'
        persistLastGoodPackage(sourceIdForCounter)
        sourceFailureCounts.value = {
          ...sourceFailureCounts.value,
          [sourceIdForCounter]: 0,
        }
        success('自动修正达标，可导入规则包')
        pushAutoFlowHistory({
          runId,
          sourceId: sourceIdForCounter,
          finalState: 'IMPORT_READY',
          success: true,
          note: latestGateNote(),
        })
        return
      }

      if (attempt < AUTO_FLOW_MAX_ATTEMPTS) {
        autoFlowState.value = 'CONSERVATIVE_RETRY'
        warning(`第 ${attempt} 次自动修正未达标，已切换保守重试`)
      } else {
        autoFlowState.value = 'ROLLBACK'
      }
    }

    const rolledBack = rollbackToLastGoodPackage(sourceIdForCounter)
    const nextFailureCount = (sourceFailureCounts.value[sourceIdForCounter] || 0) + 1
    sourceFailureCounts.value = {
      ...sourceFailureCounts.value,
      [sourceIdForCounter]: nextFailureCount,
    }
    if (nextFailureCount >= 3) {
      autoFlowState.value = 'QUARANTINED'
      warning(rolledBack ? '已回滚到上一个可用包；连续失败达到阈值，source 进入隔离状态' : '连续失败达到阈值，已进入隔离状态')
      autoFlowSummary.value.push(`state=QUARANTINED failureCount=${nextFailureCount}`)
      pushAutoFlowHistory({
        runId,
        sourceId: sourceIdForCounter,
        finalState: 'QUARANTINED',
        success: false,
        note: `${rolledBack ? 'rolled_back;' : ''}${latestGateNote()}`,
      })
      return
    }

    autoFlowState.value = 'MANUAL_REQUIRED'
    warning(rolledBack ? '已回滚到上一个可用包；自动修正未达导入门槛，请手工补样本或调整规则' : '自动修正未达导入门槛，请手工补样本或调整规则')
    autoFlowSummary.value.push(`state=MANUAL_REQUIRED failureCount=${nextFailureCount}`)
    pushAutoFlowHistory({
      runId,
      sourceId: sourceIdForCounter,
      finalState: 'MANUAL_REQUIRED',
      success: false,
      note: `${rolledBack ? 'rolled_back;' : ''}${latestGateNote()}`,
    })
  }

  async function resetCurrentSourceFlowState(options?: {
    lifecycleState?: 'new' | 'warming'
    clearPreferredActions?: boolean
  }) {
    const sourceIdForCounter = currentPackage.value?.source.id || sourceId.value.trim()
    if (!sourceIdForCounter) {
      warning('缺少 sourceId，无法重置 source 状态')
      return
    }
    const lifecycleState = options?.lifecycleState || 'warming'
    const clearPreferredActions = Boolean(options?.clearPreferredActions)

    try {
      const response = await resetSourceFlowAssistProfile({
        sourceId: sourceIdForCounter,
        lifecycleState,
        clearPreferredActions,
      })
      if (!response.isSuccess) {
        warning(response.errorMsg || '重置 source 状态失败')
        return
      }
      sourceFailureCounts.value = {
        ...sourceFailureCounts.value,
        [sourceIdForCounter]: 0,
      }
      autoFlowState.value = 'IDLE'
      autoFlowSummary.value = [
        ...autoFlowSummary.value,
        `state=RESET lifecycle=${lifecycleState} clearPreferred=${clearPreferredActions ? 'yes' : 'no'}`,
      ]
      await refreshCurrentSourceFlowProfile()
      success('已重置 source 状态，可重新执行自动流程')
    } catch {
      warning('重置 source 状态失败')
    }
  }

  async function refreshCurrentSourceFlowProfile() {
    const sourceIdForCounter = currentPackage.value?.source.id || sourceId.value.trim()
    if (!sourceIdForCounter) {
      sourceFlowProfileSummary.value = []
      sourceFlowProfileAuditSummary.value = []
      return
    }
    sourceFlowProfileLoading.value = true
    try {
      const response = await requestSourceFlowAssistProfile({ sourceId: sourceIdForCounter })
      if (!response.isSuccess || !response.data?.profile) {
        sourceFlowProfileSummary.value = ['profile: unavailable']
        return
      }
      const profile = response.data.profile
      sourceFlowProfileSummary.value = [
        `sourceId=${profile.sourceId}`,
        `lifecycle=${profile.lifecycleState}`,
        `conservative=${profile.conservativeMode ? 'on' : 'off'}`,
        `preferredActions=${profile.preferredActions.join(' | ') || '--'}`,
        `recentFailures=${profile.recentFailureCodes.join(' | ') || '--'}`,
        `lastGoodRunId=${profile.lastGoodRunId || '--'}`,
        `updatedAt=${profile.updatedAt || '--'}`,
      ]

      const auditResponse = await requestSourceFlowAssistProfileAudit({
        sourceId: sourceIdForCounter,
        limit: 8,
      })
      if (auditResponse.isSuccess && Array.isArray(auditResponse.data?.entries)) {
        sourceFlowProfileAuditSummary.value = auditResponse.data.entries.map(entry => {
          const parts = [
            `${entry.action}`,
            entry.lifecycleState ? `lifecycle=${entry.lifecycleState}` : '',
            entry.conservativeMode == null ? '' : `conservative=${entry.conservativeMode ? 'on' : 'off'}`,
            entry.note ? `note=${entry.note}` : '',
            entry.updatedBy ? `by=${entry.updatedBy}` : '',
            `at=${entry.createdAt}`,
          ].filter(Boolean)
          return parts.join(' | ')
        })
      } else {
        sourceFlowProfileAuditSummary.value = ['audit: unavailable']
      }
    } catch {
      sourceFlowProfileSummary.value = ['profile: load failed']
      sourceFlowProfileAuditSummary.value = ['audit: load failed']
    } finally {
      sourceFlowProfileLoading.value = false
    }
  }

  async function refreshCurrentSourceSessionProfile() {
    const sourceIdForCounter = currentPackage.value?.source.id || sourceId.value.trim()
    if (!sourceIdForCounter) {
      sourceSessionProfileSummary.value = []
      return
    }
    sourceSessionProfileLoading.value = true
    try {
      const response = await requestSourceSessionProfile({ sourceId: sourceIdForCounter })
      if (!response.isSuccess || !response.data?.profile) {
        sourceSessionProfileSummary.value = ['sessionProfile: unavailable']
        return
      }
      const profile = response.data.profile
      sourceSessionProfileSummary.value = [
        `sessionState=${profile.sessionState}`,
        `strategy=${profile.acquireStrategy}`,
        `sessionKey=${profile.sessionKey || '--'}`,
        `quality=${Math.round(Number(profile.qualityScore || 0))}`,
        `failStreak=${profile.failStreak}`,
        `cooldownUntil=${profile.cooldownUntil || '--'}`,
        `success/failure=${profile.successCount}/${profile.failureCount}`,
        `challenge/empty=${profile.challengeHits}/${profile.emptyContentHits}`,
        `lastRecovery=${profile.lastRecoveryAction || '--'}`,
        `updatedAt=${profile.updatedAt || '--'}`,
      ]
    } catch {
      sourceSessionProfileSummary.value = ['sessionProfile: load failed']
    } finally {
      sourceSessionProfileLoading.value = false
    }
  }

  async function autoAcquireCurrentSourceSession() {
    const sourceIdForCounter = currentPackage.value?.source.id || sourceId.value.trim()
    if (!sourceIdForCounter) {
      warning('缺少 sourceId，无法自动获取会话')
      return
    }
    try {
      const response = await requestAutoAcquireFetchSession({
        sourceId: sourceIdForCounter,
        acquireStrategy: 'auto_browser_like',
        ttlSeconds: Number(sessionTtlSeconds.value || 1800),
      })
      if (!response.isSuccess || !response.data) {
        warning(response.errorMsg || '自动获取会话失败')
        return
      }
      if (response.data.sessionKey) {
        fetchSessionKey.value = response.data.sessionKey
      }
      autoFlowSummary.value = [
        ...autoFlowSummary.value,
        `session=auto_acquire quality=${Math.round(response.data.sessionQualityScore || 0)} key=${response.data.sessionKey || '--'}`,
      ].slice(-50)
      await refreshCurrentSourceSessionProfile()
      success('自动会话获取完成')
    } catch {
      warning('自动获取会话失败')
    }
  }

  async function verifyCurrentSourceSession() {
    const sourceIdForCounter = currentPackage.value?.source.id || sourceId.value.trim()
    if (!sourceIdForCounter) {
      warning('缺少 sourceId，无法验证会话')
      return
    }
    try {
      const probeUrl = runTargetUrl.value.trim() || validateChapterUrl.value.trim() || ''
      const response = await requestVerifyFetchSession({
        sourceId: sourceIdForCounter,
        probeUrl: probeUrl || undefined,
        timeoutMs: 12000,
        expectedMinBodyLength: 200,
      })
      if (!response.isSuccess || !response.data) {
        warning(response.errorMsg || '会话验证失败')
        return
      }
      const verify = response.data
      autoFlowSummary.value = [
        ...autoFlowSummary.value,
        `session=verify ${verify.verified ? 'pass' : `fail(${verify.degradedReason || 'unknown'})`} quality=${Math.round(verify.sessionQualityScore || 0)}`,
      ].slice(-50)
      await refreshCurrentSourceSessionProfile()
      if (verify.verified) {
        success('会话验证通过')
      } else {
        warning(`会话验证失败: ${verify.degradedReason || 'unknown'}`)
      }
    } catch {
      warning('会话验证失败')
    }
  }

  async function recoverCurrentSourceSession() {
    const sourceIdForCounter = currentPackage.value?.source.id || sourceId.value.trim()
    if (!sourceIdForCounter) {
      warning('缺少 sourceId，无法恢复会话')
      return
    }
    try {
      const response = await recoverSourceSessionProfile({
        sourceId: sourceIdForCounter,
        action: 'refresh_session',
      })
      if (!response.isSuccess) {
        warning(response.errorMsg || '会话恢复失败')
        return
      }
      autoFlowSummary.value = [
        ...autoFlowSummary.value,
        'session=recover action=refresh_session',
      ].slice(-50)
      await refreshCurrentSourceSessionProfile()
      success('会话恢复动作已执行')
    } catch {
      warning('会话恢复失败')
    }
  }

  onMounted(async () => {
    loadDebugSnapshots()
    await refreshPackages()
    await refreshCurrentSourceFlowProfile()
    await refreshCurrentSourceSessionProfile()
  })

  return {
    sourcePackagesLoading,
    sourcePackageImporting,
    sourcePackageDetailLoading,
    sourceBuildRunning,
    autoFlowState,
    autoFlowRunId,
    autoFlowSummary,
    autoFlowHistorySummary,
    currentSourceAutoFlowHistorySummary,
    currentSourceAutoFlowStats,
    currentSourceAutoFlowStreak,
    currentSourceAutoFlowRecommendation,
    currentSourceAutoFlowHealthSummary,
    importPreviewGuardSummary,
    currentSourceForcedImportSummary,
    importPreviewBlocked: computed(() => importPreviewGuard.value.blocked),
    forceImportArmed,
    sourceFlowProfileLoading,
    sourceFlowProfileSummary,
    sourceFlowProfileAuditSummary,
    sourceSessionProfileLoading,
    sourceSessionProfileSummary,
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
    runSmokeSampleSize,
    runSmokePassRateThreshold,
    runResult,
    runSearchDetailResult,
    runChaptersResult,
    runContentResult,
    runFullFlowSummary,
    runContentSmokeSummary,
    runContentSmokeFailures,
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
    runContentSummary,
    runContentSuggestedActions,
    buildFromSamples,
    buildValidateAndAutoRefine,
    importFetchSession: () => importFetchSession(lastFetchDebug),
    loadFetchSession,
    previewFetchHtml: () => previewFetchHtml(lastFetchDebug),
    restoreDebugSnapshot,
    clearDebugSnapshots,
    importPreviewPackage,
    forceImportPreviewPackage,
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
    runSearchToContentValidation,
    runChaptersContentSmoke,
    refreshCurrentSourceFlowProfile,
    refreshCurrentSourceSessionProfile,
    autoAcquireCurrentSourceSession,
    verifyCurrentSourceSession,
    recoverCurrentSourceSession,
    resetCurrentSourceFlowState,
    applySmokeGatePreset,
    applyRecommendedSmokeGate,
    clearAutoFlowHistory,
    clearPreview,
    goBack,
  }
}
