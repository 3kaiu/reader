import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { useMessage } from '@/composables/useMessage'
import { syncApi } from '@/api/sync'
import type {
  NxsSourcePackageDetail,
  SourceFetchDebugInfo,
  SourceValidationStepReport,
} from '@/api/sync'
import type {
  ChapterRunResultItem,
  RunByPackageResult,
  SearchRunResultItem,
} from '@/composables/source-builder/types'

type UseSourceBuilderRunOperationsOptions = {
  currentPackage: ComputedRef<NxsSourcePackageDetail | null>
  lastFetchDebug: Ref<SourceFetchDebugInfo | null>
}

export function useSourceBuilderRunOperations(
  options: UseSourceBuilderRunOperationsOptions
) {
  const { success, warning } = useMessage()

  const runSearchQuery = ref('')
  const runTargetUrl = ref('')
  const runResult = ref<unknown>(null)
  const runSearchDetailResult = ref<unknown>(null)
  const runChaptersResult = ref<unknown>(null)
  const runLoading = ref(false)

  const runExecutionProfileSummary = computed(() => {
    const pkg = options.currentPackage.value
    if (!pkg?.searchProfile) {
      return []
    }

    return pkg.searchProfile.strategies.map(strategy => {
      const state = strategy.enabled ? 'enabled' : 'disabled'
      const note =
        strategy.disabledReason ||
        strategy.queryTemplate ||
        strategy.detailUrlTemplate ||
        strategy.resultSelector ||
        '--'

      return `${strategy.id}: ${strategy.mode} / ${strategy.provider} / ${state} / ${note}`
    })
  })

  const runSearchResultItems = computed<SearchRunResultItem[]>(() => {
    const payload = runResult.value as { result?: unknown } | null
    const items = payload?.result
    if (!Array.isArray(items)) {
      return []
    }
    const normalized: SearchRunResultItem[] = []
    for (const item of items) {
      if (!item || typeof item !== "object") {
        continue
      }
      const record = item as Record<string, unknown>
      normalized.push({
        name: typeof record.name === 'string' ? record.name : undefined,
        bookUrl: typeof record.bookUrl === 'string' ? record.bookUrl : undefined,
        sourceName: typeof record.sourceName === 'string' ? record.sourceName : undefined,
        author: typeof record.author === 'string' ? record.author : undefined,
      })
    }
    return normalized
  })

  const runSummary = computed(() => {
    const payload = runResult.value as {
      operation?: string
      step?: SourceValidationStepReport | null
      result?: unknown
    } | null
    if (!payload) {
      return []
    }

    const summary = [`operation: ${payload.operation || '--'}`]
    const step = payload.step
    if (step) {
      summary.push(`step: ${step.step}`)
      summary.push(`status: ${step.ok ? 'pass' : 'fail'}`)
      summary.push(`summary: ${step.summary}`)
      if (step.failureCode) {
        summary.push(`failure: ${step.failureCode}`)
      }
      if (step.itemCount != null) {
        summary.push(`count: ${step.itemCount}`)
      }
      if (step.qualityScore != null) {
        summary.push(`quality: ${Math.round(step.qualityScore * 100)}`)
      }
    }

    if (payload.operation === 'search') {
      summary.push(`candidates: ${runSearchResultItems.value.length}`)
    }

    return summary
  })

  const runSuggestedActions = computed(() => {
    const payload = runResult.value as { step?: SourceValidationStepReport | null } | null
    return payload?.step?.suggestedActions ?? []
  })

  const runSearchDetailSummary = computed(() => {
    const payload = runSearchDetailResult.value as RunByPackageResult | null
    if (!payload) {
      return []
    }

    const summary = [`detail operation: ${payload.operation || '--'}`]
    const step = payload.step
    if (step) {
      summary.push(`detail step: ${step.step}`)
      summary.push(`detail status: ${step.ok ? 'pass' : 'fail'}`)
      summary.push(`detail summary: ${step.summary}`)
      if (step.failureCode) {
        summary.push(`detail failure: ${step.failureCode}`)
      }
    }

    const result = payload.result
    if (result && typeof result === 'object') {
      const record = result as Record<string, unknown>
      if (typeof record.name === 'string') {
        summary.push(`resolved name: ${record.name}`)
      }
      if (typeof record.author === 'string') {
        summary.push(`resolved author: ${record.author}`)
      }
      if (typeof record.tocUrl === 'string') {
        summary.push(`resolved toc: ${record.tocUrl}`)
      }
    }

    return summary
  })

  const runSearchDetailSuggestedActions = computed(() => {
    const payload = runSearchDetailResult.value as { step?: SourceValidationStepReport | null } | null
    return payload?.step?.suggestedActions ?? []
  })

  const runChapterResultItems = computed<ChapterRunResultItem[]>(() => {
    const payload = runChaptersResult.value as { result?: unknown } | null
    const items = payload?.result
    if (!Array.isArray(items)) {
      return []
    }
    const normalized: ChapterRunResultItem[] = []
    for (const item of items) {
      if (!item || typeof item !== 'object') {
        continue
      }
      const record = item as Record<string, unknown>
      normalized.push({
        title: typeof record.title === 'string' ? record.title : undefined,
        url: typeof record.url === 'string' ? record.url : undefined,
      })
    }
    return normalized
  })

  const runChaptersSummary = computed(() => {
    const payload = runChaptersResult.value as RunByPackageResult | null
    if (!payload) {
      return []
    }

    const summary = [`chapters operation: ${payload.operation || '--'}`]
    const step = payload.step
    if (step) {
      summary.push(`chapters step: ${step.step}`)
      summary.push(`chapters status: ${step.ok ? 'pass' : 'fail'}`)
      summary.push(`chapters summary: ${step.summary}`)
      if (step.failureCode) {
        summary.push(`chapters failure: ${step.failureCode}`)
      }
      if (step.itemCount != null) {
        summary.push(`chapters count: ${step.itemCount}`)
      }
    }

    return summary
  })

  const runChaptersSuggestedActions = computed(() => {
    const payload = runChaptersResult.value as { step?: SourceValidationStepReport | null } | null
    return payload?.step?.suggestedActions ?? []
  })

  async function executeRunOperation(
    operation: 'search' | 'book_info' | 'chapters' | 'content',
    optionsOverride?: {
      query?: string
      targetUrl?: string
      quietSuccess?: boolean
    }
  ): Promise<RunByPackageResult | null> {
    if (!options.currentPackage.value) {
      warning('当前没有可调试的规则包')
      return null
    }

    try {
      const payload =
        operation === 'search'
          ? {
              package: options.currentPackage.value,
              operation,
              query: optionsOverride?.query ?? runSearchQuery.value.trim(),
            }
          : {
              package: options.currentPackage.value,
              operation,
              targetUrl: optionsOverride?.targetUrl ?? runTargetUrl.value.trim(),
            }

      const response = await syncApi.runEngineByPackage(payload)
      if (response.isSuccess) {
        options.lastFetchDebug.value = response.data?.fetchDebug ?? null
        if (!optionsOverride?.quietSuccess) {
          success(`已执行 ${operation}`)
        }
        return (response.data ?? null) as RunByPackageResult | null
      }

      warning(response.errorMsg || `${operation} 执行失败`)
      return null
    } catch {
      warning(`${operation} 执行失败`)
      return null
    }
  }

  async function runOperation(operation: 'search' | 'book_info' | 'chapters' | 'content') {
    runLoading.value = true
    try {
      const result = await executeRunOperation(operation)
      runResult.value = result
      if (operation !== 'search') {
        runSearchDetailResult.value = null
        runChaptersResult.value = null
      }
    } finally {
      runLoading.value = false
    }
  }

  async function runSearchAndValidateDetail() {
    if (!runSearchQuery.value.trim()) {
      warning('请先填写 search query')
      return
    }

    runLoading.value = true
    runSearchDetailResult.value = null
    try {
      const searchResult = await executeRunOperation('search', {
        query: runSearchQuery.value.trim(),
        quietSuccess: true,
      })
      runResult.value = searchResult
      if (!searchResult) {
        return
      }

      const candidates = Array.isArray(searchResult.result)
        ? (searchResult.result as Array<Record<string, unknown>>)
        : []
      const detailUrl = candidates.find(
        item => typeof item?.bookUrl === 'string' && item.bookUrl.trim().length > 0,
      )?.bookUrl as string | undefined

      if (!detailUrl) {
        warning('search 已执行，但没有可用于验证详情页的候选结果')
        return
      }

      runTargetUrl.value = detailUrl
      const detailResult = await executeRunOperation('book_info', {
        targetUrl: detailUrl,
        quietSuccess: true,
      })
      runSearchDetailResult.value = detailResult

      if (detailResult) {
        success('已完成 search -> detail 验证')
      }
    } finally {
      runLoading.value = false
    }
  }

  async function runDetailValidation(targetUrl: string) {
    const normalizedUrl = targetUrl.trim()
    if (!normalizedUrl) {
      warning('当前候选缺少可验证的详情页 URL')
      return
    }

    runLoading.value = true
    runTargetUrl.value = normalizedUrl
    runChaptersResult.value = null
    try {
      const detailResult = await executeRunOperation('book_info', {
        targetUrl: normalizedUrl,
        quietSuccess: true,
      })
      runSearchDetailResult.value = detailResult
      if (detailResult) {
        success('已完成详情页验证')
      }
    } finally {
      runLoading.value = false
    }
  }

  async function runDetailAndChaptersValidation(targetUrl: string) {
    const normalizedUrl = targetUrl.trim()
    if (!normalizedUrl) {
      warning('当前候选缺少可验证的详情页 URL')
      return
    }

    runLoading.value = true
    runTargetUrl.value = normalizedUrl
    runChaptersResult.value = null
    try {
      const detailResult = await executeRunOperation('book_info', {
        targetUrl: normalizedUrl,
        quietSuccess: true,
      })
      runSearchDetailResult.value = detailResult
      if (!detailResult) {
        return
      }

      const detailPayload = detailResult.result
      const chaptersTarget =
        detailPayload && typeof detailPayload === 'object'
          ? (((detailPayload as Record<string, unknown>).tocUrl as string | undefined)
              || normalizedUrl)
          : normalizedUrl

      const chaptersResult = await executeRunOperation('chapters', {
        targetUrl: chaptersTarget,
        quietSuccess: true,
      })
      runChaptersResult.value = chaptersResult

      if (chaptersResult) {
        success('已完成 detail -> chapters 验证')
      }
    } finally {
      runLoading.value = false
    }
  }

  function clearRunState() {
    runResult.value = null
    runSearchDetailResult.value = null
    runChaptersResult.value = null
  }

  return {
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
  }
}
