import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { useMessage } from '@/composables/useMessage'
import type {
  FetchHtmlResponse,
  NxsSourcePackageDetail,
  SourceBuildDiagnostics,
  SourceFetchDebugInfo,
  SourceRuleHints,
  SourceValidationStepReport,
} from '@/api/sync'
import type {
  RefineSuggestion,
  SourceBuilderDebugSnapshot,
} from '@/composables/source-builder/types'
import {
  buildRefineSuggestions,
  hasStructuredSourceRuleHints,
} from '@/composables/source-builder/sourceBuilderRefineSuggestions'
import {
  applyRefinedPackageResult,
  applyValidatedPreviewPackage,
  buildFetchDebugFromPackage,
  buildRefineSnapshot,
  buildValidationRefineSamples,
  buildValidationSnapshot,
  refineSourceBuilderPackage,
  validateSourceBuilderPackage,
} from '@/composables/source-builder/sourceBuilderValidationActions'

type UseSourceBuilderValidationRefineOptions = {
  currentPackage: ComputedRef<NxsSourcePackageDetail | null>
  currentPackageJson: ComputedRef<string>
  previewPackage: Ref<NxsSourcePackageDetail | null>
  previewPackageJson: Ref<string>
  previewDiagnostics: Ref<SourceBuildDiagnostics | null>
  fetchMode: Ref<string>
  fetchProvider: Ref<string>
  fetchSessionKey: Ref<string>
  fetchHtmlPreview: Ref<FetchHtmlResponse | null>
  lastFetchDebug: Ref<SourceFetchDebugInfo | null>
  buildSnapshotContext: () => Pick<
    SourceBuilderDebugSnapshot,
    'sourceLabel' | 'sessionKey' | 'bookCurl' | 'chapterCurl' | 'searchCurl' | 'searchKeyword'
  >
  pushDebugSnapshot: (
    snapshot: Omit<SourceBuilderDebugSnapshot, 'id' | 'createdAtMs'>
  ) => void
}

export function useSourceBuilderValidationRefine(
  options: UseSourceBuilderValidationRefineOptions
) {
  const { success, warning } = useMessage()

  const validateSearchQuery = ref('')
  const validateBookUrl = ref('')
  const validateTocUrl = ref('')
  const validateChapterUrl = ref('')
  const validationReport = ref<unknown>(null)
  const validationLoading = ref(false)
  const structuredHints = ref<SourceRuleHints>({
    noisePatterns: [],
  })
  const freeTextHints = ref('')
  const refineLoading = ref(false)
  const refineAutoActions = ref<string[]>([])
  const refineAppliedHints = ref<string[]>([])
  const refineChanges = ref<Array<{ path: string; before?: string | null; after?: string | null }>>([])

  const validationStepSummary = computed<SourceValidationStepReport[]>(() => {
    const report = (validationReport.value as { report?: { steps?: SourceValidationStepReport[] } } | null)?.report
    const steps = report?.steps
    if (Array.isArray(steps) && steps.length > 0) {
      return steps
    }
    return options.currentPackage.value?.validation?.steps ?? []
  })

  const hasStructuredHints = computed(() => hasStructuredSourceRuleHints(structuredHints.value))

  const refineSuggestions = computed<RefineSuggestion[]>(() =>
    buildRefineSuggestions(
      {
        currentPackage: options.currentPackage.value,
        validationSteps: validationStepSummary.value,
        previewDiagnostics: options.previewDiagnostics.value,
        structuredHints: structuredHints.value,
        freeTextHints: freeTextHints.value,
      },
      {
        setFetchMode: value => {
          options.fetchMode.value = value
        },
        setFetchProvider: value => {
          options.fetchProvider.value = value
        },
        setStructuredHints: value => {
          structuredHints.value = value
        },
        setFreeTextHints: value => {
          freeTextHints.value = value
        },
      }
    )
  )

  async function validateCurrentPackage() {
    if (!options.currentPackage.value) {
      warning('当前没有可验证的规则包')
      return
    }

    validationLoading.value = true
    try {
      const response = await validateSourceBuilderPackage(
        options.currentPackage.value,
        buildValidationRefineSamples({
          searchQuery: validateSearchQuery.value,
          bookUrl: validateBookUrl.value,
          tocUrl: validateTocUrl.value,
          chapterUrl: validateChapterUrl.value,
        })
      )
      validationReport.value = response.data ?? null
      if (response.isSuccess) {
        options.lastFetchDebug.value = response.data?.fetchDebug ?? null
        options.previewPackage.value = applyValidatedPreviewPackage({
          previewPackage: options.previewPackage.value,
          validationReport: response.data ?? null,
        })
        if (options.previewPackage.value) {
          options.previewPackageJson.value = JSON.stringify(options.previewPackage.value, null, 2)
        }
        options.pushDebugSnapshot(
          buildValidationSnapshot({
            snapshotContext: options.buildSnapshotContext(),
            packageData: options.previewPackage.value ?? options.currentPackage.value,
            packageJson: options.currentPackageJson.value,
            diagnostics: options.previewDiagnostics.value,
            validationReport: response.data ?? null,
            fetchDebug: response.data?.fetchDebug ?? null,
            fetchHtmlPreview: options.fetchHtmlPreview.value,
          })
        )
        success('验证已完成')
      } else {
        warning(response.errorMsg || '验证失败')
      }
    } catch {
      warning('验证失败')
    } finally {
      validationLoading.value = false
    }
  }

  function applyRefineSuggestion(suggestion: RefineSuggestion) {
    suggestion.apply()
    success(`已填充建议: ${suggestion.title}`)
  }

  async function executeRefinePackage(successMessage: string) {
    if (!options.currentPackage.value) {
      warning('当前没有可修正的规则包')
      return
    }
    const hasAutoRefineSignal = (options.currentPackage.value.validation?.steps ?? []).some(
      step => Boolean(step.failureCode) || step.manualReviewRecommended
    )
    if (!hasStructuredHints.value && !freeTextHints.value.trim() && !hasAutoRefineSignal) {
      warning('当前没有可用提示，也没有可自动修正的失败分类')
      return
    }

    refineLoading.value = true
    try {
      const response = await refineSourceBuilderPackage({
        sourcePackage: options.currentPackage.value,
        structuredHints: hasStructuredHints.value ? structuredHints.value : null,
        freeTextHints: freeTextHints.value,
        samples: buildValidationRefineSamples({
          searchQuery: validateSearchQuery.value,
          bookUrl: validateBookUrl.value,
          tocUrl: validateTocUrl.value,
          chapterUrl: validateChapterUrl.value,
        }),
      })
      if (!response.isSuccess || !response.data) {
        warning(response.errorMsg || '规则修正失败')
        return
      }
      const refineResult = applyRefinedPackageResult(response.data)
      options.previewPackage.value = refineResult.packageData
      options.previewPackageJson.value = refineResult.packageJson
      refineAutoActions.value = refineResult.autoActions
      refineAppliedHints.value = refineResult.appliedHints
      refineChanges.value = refineResult.changes
      validationReport.value = refineResult.validationReport
      options.lastFetchDebug.value = buildFetchDebugFromPackage(refineResult.packageData)
      options.pushDebugSnapshot(
        buildRefineSnapshot({
          snapshotContext: options.buildSnapshotContext(),
          packageData: refineResult.packageData,
          packageJson: options.previewPackageJson.value,
          diagnostics: options.previewDiagnostics.value,
          fetchDebug: options.lastFetchDebug.value,
          fetchHtmlPreview: options.fetchHtmlPreview.value,
        })
      )
      success(successMessage)
    } catch {
      warning('规则修正失败')
    } finally {
      refineLoading.value = false
    }
  }

  async function refineCurrentPackage() {
    await executeRefinePackage('规则已根据提示修正并重新验证')
  }

  async function applyRefineSuggestionAndRefine(suggestion: RefineSuggestion) {
    applyRefineSuggestion(suggestion)
    await executeRefinePackage(`已应用建议并修正: ${suggestion.title}`)
  }

  function clearValidationRefineState() {
    validationReport.value = null
    refineAutoActions.value = []
    refineAppliedHints.value = []
    refineChanges.value = []
  }

  function applySnapshot(snapshot: SourceBuilderDebugSnapshot) {
    validationReport.value = snapshot.validationReport ?? null
  }

  return {
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
    applySnapshot,
    clearValidationRefineState,
  }
}
