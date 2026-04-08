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
  const CONTENT_MIN_LEN = 120

  const runSearchQuery = ref('')
  const runTargetUrl = ref('')
  const runResult = ref<unknown>(null)
  const runSearchDetailResult = ref<unknown>(null)
  const runChaptersResult = ref<unknown>(null)
  const runContentResult = ref<unknown>(null)
  const runFullFlowSummary = ref<string[]>([])
  const runContentSmokeSummary = ref<string[]>([])
  const runContentSmokeFailures = ref<string[]>([])
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
      if (!item || typeof item !== 'object') {
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

  const runContentSummary = computed(() => {
    const payload = runContentResult.value as RunByPackageResult | null
    if (!payload) {
      return []
    }

    const summary = [`content operation: ${payload.operation || '--'}`]
    const step = payload.step
    if (step) {
      summary.push(`content step: ${step.step}`)
      summary.push(`content status: ${step.ok ? 'pass' : 'fail'}`)
      summary.push(`content summary: ${step.summary}`)
      if (step.failureCode) {
        summary.push(`content failure: ${step.failureCode}`)
      }
    }

    const contentLen = extractContentLength(payload.result)
    if (contentLen > 0) {
      summary.push(`content length: ${contentLen}`)
    }
    return summary
  })

  const runContentSuggestedActions = computed(() => {
    const payload = runContentResult.value as { step?: SourceValidationStepReport | null } | null
    return payload?.step?.suggestedActions ?? []
  })

  function extractStringField(record: Record<string, unknown>, keys: string[]): string {
    for (const key of keys) {
      const value = record[key]
      if (typeof value === 'string' && value.trim()) {
        return value.trim()
      }
    }
    return ''
  }

  function extractContentLength(result: unknown): number {
    if (typeof result === 'string') {
      return result.trim().length
    }
    if (!result || typeof result !== 'object') {
      return 0
    }
    const record = result as Record<string, unknown>
    const direct = extractStringField(record, ['content', 'text', 'body', 'html', 'value'])
    if (direct) {
      return direct.length
    }
    const data = record.data
    if (data && typeof data === 'object') {
      return extractContentLength(data)
    }
    return 0
  }

  function extractDetailTarget(searchResult: RunByPackageResult): string {
    const candidates = Array.isArray(searchResult.result)
      ? (searchResult.result as Array<Record<string, unknown>>)
      : []
    for (const candidate of candidates) {
      const url = extractStringField(candidate, ['bookUrl', 'url', 'href', 'link'])
      if (url) return url
    }
    return ''
  }

  function extractTocTarget(detailResult: RunByPackageResult, fallback: string): string {
    const payload = detailResult.result
    if (payload && typeof payload === 'object') {
      const tocUrl = extractStringField(payload as Record<string, unknown>, ['tocUrl', 'catalogUrl'])
      if (tocUrl) return tocUrl
    }
    return fallback
  }

  function extractChapterTarget(chaptersResult: RunByPackageResult): string {
    const items = Array.isArray(chaptersResult.result)
      ? (chaptersResult.result as Array<Record<string, unknown>>)
      : []
    for (const item of items) {
      const chapterUrl = extractStringField(item, ['url', 'href', 'link'])
      if (chapterUrl) return chapterUrl
    }
    return ''
  }

  function extractChapterCandidates(chaptersResult: RunByPackageResult): ChapterRunResultItem[] {
    const raw = Array.isArray(chaptersResult.result)
      ? (chaptersResult.result as Array<Record<string, unknown>>)
      : []
    const items: ChapterRunResultItem[] = []
    for (const item of raw) {
      const url = extractStringField(item, ['url', 'href', 'link'])
      if (!url) continue
      const title = extractStringField(item, ['title', 'name', 'chapterName']) || '--'
      items.push({ title, url })
    }
    return items
  }

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
        runContentResult.value = null
        runFullFlowSummary.value = []
        runContentSmokeSummary.value = []
        runContentSmokeFailures.value = []
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
    runChaptersResult.value = null
    runContentResult.value = null
    runFullFlowSummary.value = []
    runContentSmokeSummary.value = []
    runContentSmokeFailures.value = []
    try {
      const searchResult = await executeRunOperation('search', {
        query: runSearchQuery.value.trim(),
        quietSuccess: true,
      })
      runResult.value = searchResult
      if (!searchResult) {
        return
      }

      const detailUrl = extractDetailTarget(searchResult)
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
    runContentResult.value = null
    runFullFlowSummary.value = []
    runContentSmokeSummary.value = []
    runContentSmokeFailures.value = []
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
    runContentResult.value = null
    runFullFlowSummary.value = []
    runContentSmokeSummary.value = []
    runContentSmokeFailures.value = []
    try {
      const detailResult = await executeRunOperation('book_info', {
        targetUrl: normalizedUrl,
        quietSuccess: true,
      })
      runSearchDetailResult.value = detailResult
      if (!detailResult) {
        return
      }

      const chaptersTarget = extractTocTarget(detailResult, normalizedUrl)
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

  async function runSearchToContentValidation(optionsOverride?: { query?: string }) {
    const searchQuery = (optionsOverride?.query ?? runSearchQuery.value).trim()
    if (!searchQuery) {
      warning('请先填写 search query')
      return { pass: false, reasons: ['missing_search_query'] }
    }

    runLoading.value = true
    runFullFlowSummary.value = []
    runSearchDetailResult.value = null
    runChaptersResult.value = null
    runContentResult.value = null
    runContentSmokeSummary.value = []
    runContentSmokeFailures.value = []

    try {
      const reasons: string[] = []

      const searchResult = await executeRunOperation('search', {
        query: searchQuery,
        quietSuccess: true,
      })
      runResult.value = searchResult
      if (!searchResult) {
        return { pass: false, reasons: ['search_failed'] }
      }
      if (searchResult.step && !searchResult.step.ok) {
        reasons.push(`search:${searchResult.step.failureCode || 'failed'}`)
      }

      const detailUrl = extractDetailTarget(searchResult)
      const searchCount = Array.isArray(searchResult.result) ? searchResult.result.length : 0
      if (!detailUrl) {
        reasons.push('search:no_detail_candidate')
      }

      let detailResult: RunByPackageResult | null = null
      let chaptersResult: RunByPackageResult | null = null
      let contentResult: RunByPackageResult | null = null

      if (detailUrl) {
        runTargetUrl.value = detailUrl
        detailResult = await executeRunOperation('book_info', {
          targetUrl: detailUrl,
          quietSuccess: true,
        })
        runSearchDetailResult.value = detailResult
        if (!detailResult) {
          reasons.push('book_info:failed')
        } else if (detailResult.step && !detailResult.step.ok) {
          reasons.push(`book_info:${detailResult.step.failureCode || 'failed'}`)
        }
      }

      if (detailResult) {
        const tocTarget = extractTocTarget(detailResult, detailUrl)
        chaptersResult = await executeRunOperation('chapters', {
          targetUrl: tocTarget,
          quietSuccess: true,
        })
        runChaptersResult.value = chaptersResult
        if (!chaptersResult) {
          reasons.push('chapters:failed')
        } else if (chaptersResult.step && !chaptersResult.step.ok) {
          reasons.push(`chapters:${chaptersResult.step.failureCode || 'failed'}`)
        }
      }

      const chapterCount = chaptersResult && Array.isArray(chaptersResult.result)
        ? chaptersResult.result.length
        : 0
      const chapterUrl = chaptersResult ? extractChapterTarget(chaptersResult) : ''
      if (chaptersResult && !chapterUrl) {
        reasons.push('chapters:no_content_candidate')
      }

      if (chapterUrl) {
        contentResult = await executeRunOperation('content', {
          targetUrl: chapterUrl,
          quietSuccess: true,
        })
        runContentResult.value = contentResult
        if (!contentResult) {
          reasons.push('content:failed')
        } else if (contentResult.step && !contentResult.step.ok) {
          reasons.push(`content:${contentResult.step.failureCode || 'failed'}`)
        }
      }

      const contentLength = contentResult ? extractContentLength(contentResult.result) : 0
      if (contentResult && contentLength < CONTENT_MIN_LEN) {
        reasons.push(`content:length<${CONTENT_MIN_LEN}`)
      }

      runFullFlowSummary.value = [
        `searchQuery=${searchQuery}`,
        `searchCandidates=${searchCount}`,
        `chapters=${chapterCount}`,
        `contentLength=${contentLength}`,
        `gate=${reasons.length === 0 ? 'pass' : `fail(${reasons.join(',')})`}`,
      ]

      if (reasons.length === 0) {
        success('已完成 search -> detail -> chapters -> content 验证')
      } else {
        warning('端到端链路验证未通过')
      }

      return { pass: reasons.length === 0, reasons }
    } finally {
      runLoading.value = false
    }
  }

  async function runChaptersContentSmoke(optionsOverride?: {
    targetUrl?: string
    sampleSize?: number
    passRateThreshold?: number
  }) {
    const sampleSize = Math.max(1, Math.min(30, Math.trunc(optionsOverride?.sampleSize ?? 10)))
    const passRateThreshold = Math.max(1, Math.min(100, Math.trunc(optionsOverride?.passRateThreshold ?? 100)))
    runLoading.value = true
    runContentSmokeSummary.value = []
    runContentSmokeFailures.value = []
    runContentResult.value = null

    try {
      const targetRaw = (optionsOverride?.targetUrl ?? runTargetUrl.value).trim()
      let chaptersResult = runChaptersResult.value as RunByPackageResult | null

      const needFreshChapters = !chaptersResult || !Array.isArray(chaptersResult.result)
      if (needFreshChapters) {
        if (!targetRaw) {
          warning('请先提供 target url 或先执行章节验证')
          return {
            pass: false,
            reasons: ['missing_target_url'],
            passed: 0,
            failed: 0,
            total: 0,
            passRate: 0,
            passRateThreshold,
            failures: ['missing_target_url'],
          }
        }
        const detailPayload = runSearchDetailResult.value as RunByPackageResult | null
        const chaptersTarget = detailPayload
          ? extractTocTarget(detailPayload, targetRaw)
          : targetRaw
        chaptersResult = await executeRunOperation('chapters', {
          targetUrl: chaptersTarget,
          quietSuccess: true,
        })
        runChaptersResult.value = chaptersResult
      }

      if (!chaptersResult) {
        warning('章节烟雾测试失败：无法获取章节列表')
        return {
          pass: false,
          reasons: ['chapters_failed'],
          passed: 0,
          failed: 0,
          total: 0,
          passRate: 0,
          passRateThreshold,
          failures: ['chapters_failed'],
        }
      }

      const chapterCandidates = extractChapterCandidates(chaptersResult).slice(0, sampleSize)
      if (chapterCandidates.length === 0) {
        warning('章节烟雾测试失败：章节列表为空')
        return {
          pass: false,
          reasons: ['chapters_empty'],
          passed: 0,
          failed: 0,
          total: 0,
          passRate: 0,
          passRateThreshold,
          failures: ['chapters_empty'],
        }
      }

      let passed = 0
      const failures: string[] = []
      for (let i = 0; i < chapterCandidates.length; i++) {
        const chapter = chapterCandidates[i]
        const contentResult = await executeRunOperation('content', {
          targetUrl: chapter.url || '',
          quietSuccess: true,
        })
        if (contentResult) {
          runContentResult.value = contentResult
        }
        const contentLen = contentResult ? extractContentLength(contentResult.result) : 0
        const stepOk = Boolean(contentResult?.step?.ok)
        if (stepOk && contentLen >= CONTENT_MIN_LEN) {
          passed += 1
          continue
        }
        const reason = contentResult?.step?.failureCode
          || (contentLen < CONTENT_MIN_LEN ? `content_too_short(${contentLen})` : 'content_failed')
        failures.push(`#${i + 1} ${chapter.title || '--'} -> ${reason}`)
      }

      const total = chapterCandidates.length
      const failed = total - passed
      const passRate = Math.round((passed / total) * 100)
      const gatePass = passRate >= passRateThreshold
      runContentSmokeSummary.value = [
        `sampled=${total}`,
        `pass=${passed}`,
        `fail=${failed}`,
        `passRate=${passRate}%`,
        `requiredPassRate=${passRateThreshold}%`,
        `gate=${gatePass ? 'pass' : 'fail'}`,
        `minContentLength=${CONTENT_MIN_LEN}`,
      ]
      runContentSmokeFailures.value = failures

      if (gatePass) {
        success(`章节连续可读验证通过 (${passed}/${total})`)
      } else {
        warning(`章节连续可读验证未通过 (${passed}/${total})`)
      }
      return {
        pass: gatePass,
        passed,
        failed,
        total,
        passRate,
        passRateThreshold,
        failures,
      }
    } finally {
      runLoading.value = false
    }
  }

  function clearRunState() {
    runResult.value = null
    runSearchDetailResult.value = null
    runChaptersResult.value = null
    runContentResult.value = null
    runFullFlowSummary.value = []
    runContentSmokeSummary.value = []
    runContentSmokeFailures.value = []
  }

  return {
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
  }
}
