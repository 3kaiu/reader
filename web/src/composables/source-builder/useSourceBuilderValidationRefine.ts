import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { useMessage } from '@/composables/useMessage'
import type {
  FetchHtmlResponse,
  NxsSourcePackageDetail,
  SourceBuildDiagnostics,
  SourceFlowAssistSuggestion,
  SourceFlowAssistProfile,
  SourceFetchDebugInfo,
  SourceRuleHints,
  SourceValidationStepReport,
} from '@/api/sync'
import type {
  RefineSuggestion,
  SourceBuilderDebugSnapshot,
} from '@/composables/source-builder/types'
import {
  appendFreeTextHint,
  buildRefineSuggestions,
  hasStructuredSourceRuleHints,
  mergeNoisePatterns,
} from '@/composables/source-builder/sourceBuilderRefineSuggestions'
import {
  applyRefinedPackageResult,
  applyValidatedPreviewPackage,
  buildFetchDebugFromPackage,
  buildRefineSnapshot,
  buildValidationRefineSamples,
  buildValidationSnapshot,
  requestSourceFlowAssistFeedback,
  requestSourceFlowAssistFeedbackStats,
  requestSourceFlowAssistProfile,
  requestSourceFlowAssist,
  saveSourceFlowAssistProfile,
  refineSourceBuilderPackage,
  validateSourceBuilderPackage,
} from '@/composables/source-builder/sourceBuilderValidationActions'

const AI_REFINE_RETRY_PLAN_SIZES = [3, 2, 1] as const
const ALLOWED_ACTION_CODES = new Set<SourceFlowAssistSuggestion['actionCode']>([
  'run_validation_with_samples',
  'fix_rule_compile_errors',
  'repair_search_selectors_or_samples',
  'repair_book_title_author_selectors',
  'repair_toc_item_selector',
  'repair_content_selector_and_noise_rules',
])

type UseSourceBuilderValidationRefineOptions = {
  currentPackage: ComputedRef<NxsSourcePackageDetail | null>
  currentPackageJson: ComputedRef<string>
  previewPackage: Ref<NxsSourcePackageDetail | null>
  previewPackageJson: Ref<string>
  previewDiagnostics: Ref<SourceBuildDiagnostics | null>
  fetchMode: Ref<string>
  fetchProvider: Ref<string>
  searchKeyword: Ref<string>
  fetchSessionKey: Ref<string>
  fetchHtmlPreview: Ref<FetchHtmlResponse | null>
  lastFetchDebug: Ref<SourceFetchDebugInfo | null>
  buildSnapshotContext: () => Pick<
    SourceBuilderDebugSnapshot,
    'sourceLabel' | 'sessionKey' | 'bookCurl' | 'chapterCurl' | 'searchCurl' | 'searchKeyword'
  >
  pushDebugSnapshot: (snapshot: Omit<SourceBuilderDebugSnapshot, 'id' | 'createdAtMs'>) => void
}

export function useSourceBuilderValidationRefine(options: UseSourceBuilderValidationRefineOptions) {
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
  const refineChanges = ref<Array<{ path: string; before?: string | null; after?: string | null }>>(
    []
  )
  const aiAssistLoading = ref(false)
  const aiAssistSummary = ref<string[]>([])
  const aiAssistSuggestions = ref<RefineSuggestion[]>([])
  const aiAssistOpsLeaderboard = ref<
    Array<{
      sourceId: string
      count: number
      accepted: number
      acceptRate: number
      avgDeltaScore: number
      regressionCount: number
    }>
  >([])
  const aiAssistOpsRegressionTop = ref<Array<{ regression: string; count: number }>>([])
  const aiAssistOpsRecommendedActions = ref<
    Array<{
      actionCode:
        | 'run_validation_with_samples'
        | 'fix_rule_compile_errors'
        | 'repair_search_selectors_or_samples'
        | 'repair_book_title_author_selectors'
        | 'repair_toc_item_selector'
        | 'repair_content_selector_and_noise_rules'
      reason: string
      priority: number
    }>
  >([])
  const aiAssistMeta = ref<{
    query: string
    normalizedQuery: string
    provider: 'workers-ai' | 'ai-gateway' | 'none'
    cached: boolean
  } | null>(null)
  const aiAssistRunId = ref<string | null>(null)
  const aiAssistProfile = ref<SourceFlowAssistProfile | null>(null)
  const aiAssistProfileSourceId = ref<string | null>(null)
  const aiAssistSuggestionActionCodeById = ref<
    Record<string, SourceFlowAssistSuggestion['actionCode']>
  >({})

  function dedupeActionCodes(actions: string[]): SourceFlowAssistSuggestion['actionCode'][] {
    const unique: SourceFlowAssistSuggestion['actionCode'][] = []
    for (const item of actions) {
      const actionCode = item as SourceFlowAssistSuggestion['actionCode']
      if (ALLOWED_ACTION_CODES.has(actionCode) && !unique.includes(actionCode)) {
        unique.push(actionCode)
      }
    }
    return unique.slice(0, 6)
  }

  async function ensureAiAssistProfile(sourceId: string) {
    if (!sourceId) return
    if (aiAssistProfileSourceId.value === sourceId && aiAssistProfile.value) return
    try {
      const response = await requestSourceFlowAssistProfile({ sourceId })
      if (!response.isSuccess || !response.data?.profile) return
      aiAssistProfile.value = response.data.profile
      aiAssistProfileSourceId.value = sourceId
      aiAssistSummary.value = [
        ...aiAssistSummary.value,
        `profileState=${response.data.profile.lifecycleState}`,
        `profileConservative=${response.data.profile.conservativeMode ? 'on' : 'off'}`,
      ]
    } catch {
      // best effort only
    }
  }

  async function persistAiAssistProfile(
    sourceId: string,
    patch: {
      lifecycleState?: SourceFlowAssistProfile['lifecycleState']
      preferredActions?: SourceFlowAssistSuggestion['actionCode'][]
      conservativeMode?: boolean
      lastGoodRunId?: string | null
      recentFailureCodes?: string[]
    }
  ) {
    if (!sourceId) return
    const current = aiAssistProfile.value?.sourceId === sourceId ? aiAssistProfile.value : null
    const next: SourceFlowAssistProfile = {
      sourceId,
      lifecycleState: patch.lifecycleState ?? current?.lifecycleState ?? 'new',
      preferredActions: dedupeActionCodes(
        patch.preferredActions ?? current?.preferredActions ?? []
      ),
      conservativeMode: patch.conservativeMode ?? current?.conservativeMode ?? false,
      lastGoodRunId:
        patch.lastGoodRunId === undefined ? (current?.lastGoodRunId ?? null) : patch.lastGoodRunId,
      recentFailureCodes: (patch.recentFailureCodes ?? current?.recentFailureCodes ?? []).slice(
        0,
        8
      ),
      updatedAt: current?.updatedAt ?? new Date().toISOString(),
    }
    aiAssistProfile.value = next
    aiAssistProfileSourceId.value = sourceId
    try {
      await saveSourceFlowAssistProfile({
        sourceId: next.sourceId,
        lifecycleState: next.lifecycleState,
        preferredActions: next.preferredActions,
        conservativeMode: next.conservativeMode,
        lastGoodRunId: next.lastGoodRunId ?? null,
        recentFailureCodes: next.recentFailureCodes,
      })
    } catch {
      // best effort only
    }
  }

  function mergeRecommendedActions(
    statsActions: Array<{
      actionCode: SourceFlowAssistSuggestion['actionCode']
      reason: string
      priority: number
    }>,
    profileActions: SourceFlowAssistSuggestion['actionCode'][]
  ) {
    const merged = [...statsActions]
    for (const actionCode of profileActions) {
      if (merged.some(item => item.actionCode === actionCode)) continue
      merged.push({
        actionCode,
        reason: 'Profile 历史偏好动作',
        priority: 999,
      })
    }
    return merged
  }

  const validationStepSummary = computed<SourceValidationStepReport[]>(() => {
    const report = (
      validationReport.value as { report?: { steps?: SourceValidationStepReport[] } } | null
    )?.report
    const steps = report?.steps
    if (Array.isArray(steps) && steps.length > 0) {
      return steps
    }
    return options.currentPackage.value?.validation?.steps ?? []
  })

  const hasStructuredHints = computed(() => hasStructuredSourceRuleHints(structuredHints.value))

  const ruleBasedSuggestions = computed<RefineSuggestion[]>(() =>
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
  const opsDrivenSuggestions = computed<RefineSuggestion[]>(() => {
    const regressions = aiAssistOpsRegressionTop.value.map(item => item.regression).join(' | ')
    if (!regressions) {
      return []
    }

    const suggestions: RefineSuggestion[] = []
    const currentSourceId = options.currentPackage.value?.source.id || ''
    const sourceOps = aiAssistOpsLeaderboard.value.find(item => item.sourceId === currentSourceId)
    const lowAccept = sourceOps && sourceOps.count >= 3 && sourceOps.acceptRate < 0.5

    if (regressions.includes('搜索')) {
      suggestions.push({
        id: 'ops-regression-search',
        step: 'ops',
        title: '[Ops] 搜索回归高频：先稳住搜索条目定位',
        detail:
          '运营统计显示搜索相关回归高频，优先固定 searchResultSelector 与详情链接语义，减少误抽。',
        kind: 'structured',
        applyLabel: '应用 Ops 搜索建议',
        apply: () => {
          structuredHints.value = {
            ...structuredHints.value,
            searchResultSelector:
              structuredHints.value.searchResultSelector ||
              '.search-list > li | .result-list li | .bookbox | .result-item | a[href]',
          }
          let next = freeTextHints.value
          next = appendFreeTextHint(next, 'search result: 仅匹配书籍条目容器，不匹配导航/分页')
          next = appendFreeTextHint(next, 'search result url: 指向书籍详情页，不指向作者页或章节页')
          freeTextHints.value = next
        },
      })
    }

    if (regressions.includes('详情')) {
      suggestions.push({
        id: 'ops-regression-book',
        step: 'ops',
        title: '[Ops] 详情回归高频：补齐书名作者规则',
        detail: '运营统计显示详情提取不稳定，先固化书名/作者 selector，避免详情判定失败。',
        kind: 'structured',
        applyLabel: '应用 Ops 详情建议',
        apply: () => {
          structuredHints.value = {
            ...structuredHints.value,
            bookTitleSelector:
              structuredHints.value.bookTitleSelector ||
              "h1 | .book-title | .title | .info h1 | meta[property='og:title']",
            authorSelector:
              structuredHints.value.authorSelector ||
              '.author | .book-author | .info .author | p.author',
          }
          freeTextHints.value = appendFreeTextHint(
            freeTextHints.value,
            'book detail: 书名与作者必须来自详情主信息区域'
          )
        },
      })
    }

    if (regressions.includes('目录')) {
      suggestions.push({
        id: 'ops-regression-toc',
        step: 'ops',
        title: '[Ops] 目录回归高频：先稳定章节列表提取',
        detail:
          '运营统计显示目录阶段掉分较多，建议先收敛 tocItemSelector，确保章节列表可持续抽取。',
        kind: 'structured',
        applyLabel: '应用 Ops 目录建议',
        apply: () => {
          structuredHints.value = {
            ...structuredHints.value,
            tocItemSelector:
              structuredHints.value.tocItemSelector ||
              '.chapter-list a | #list a | .catalog a | a[href]',
          }
          freeTextHints.value = appendFreeTextHint(
            freeTextHints.value,
            'toc: 排除相关推荐、上一篇/下一篇、分页链接'
          )
        },
      })
    }

    if (regressions.includes('正文')) {
      suggestions.push({
        id: 'ops-regression-content',
        step: 'ops',
        title: '[Ops] 正文回归高频：收窄正文并强化去噪',
        detail: '运营统计显示正文质量回归频发，建议先固定正文容器并补充常见噪音词。',
        kind: 'structured',
        applyLabel: '应用 Ops 正文建议',
        apply: () => {
          structuredHints.value = mergeNoisePatterns(
            {
              ...structuredHints.value,
              contentSelector:
                structuredHints.value.contentSelector ||
                '#content | .content | .txtnav | .read-content | article',
            },
            ['最新网址', '推广', '广告', '手机阅读', '请收藏', '上一章', '下一章']
          )
          let next = freeTextHints.value
          next = appendFreeTextHint(next, 'content: 只保留连续正文段落，不包含工具栏与相关推荐')
          freeTextHints.value = next
        },
      })
    }

    if (lowAccept || regressions.includes('未定位')) {
      suggestions.push({
        id: 'ops-regression-conservative-plan',
        step: 'ops',
        title: '[Ops] 低命中策略：先最小变更再迭代',
        detail:
          '当前 source 的 AI 命中率偏低或回归不可定位，建议每次只施加一类修复动作，降低组合回归风险。',
        kind: 'free_text',
        applyLabel: '应用 Ops 保守策略',
        apply: () => {
          let next = freeTextHints.value
          next = appendFreeTextHint(
            next,
            'refine strategy: 每次只做一种规则改动，优先搜索->详情->目录->正文'
          )
          next = appendFreeTextHint(next, 'refine strategy: 出现掉分立即回滚并缩小改动范围')
          freeTextHints.value = next
        },
      })
    }

    return suggestions
  })
  const refineSuggestions = computed<RefineSuggestion[]>(() => {
    const merged = [
      ...opsDrivenSuggestions.value,
      ...aiAssistSuggestions.value,
      ...ruleBasedSuggestions.value,
    ]
    const unique = new Map<string, RefineSuggestion>()
    for (const item of merged) {
      if (!unique.has(item.id)) {
        unique.set(item.id, item)
      }
    }
    return [...unique.values()]
  })

  function statusRank(status: string | undefined): number {
    switch (status) {
      case 'pass':
        return 3
      case 'warn':
        return 2
      case 'unknown':
        return 1
      case 'fail':
      default:
        return 0
    }
  }

  function buildRegressionSummary(
    beforePackage: NxsSourcePackageDetail,
    afterPackage: NxsSourcePackageDetail
  ): string {
    const before = beforePackage.validation?.health
    const after = afterPackage.validation?.health
    if (!before || !after) {
      return '健康分段数据缺失'
    }

    const segments = [
      ['搜索', before.search, after.search],
      ['详情', before.book, after.book],
      ['目录', before.toc, after.toc],
      ['正文', before.content, after.content],
    ] as const

    const degraded = segments
      .filter(([, beforeSeg, afterSeg]) => {
        const statusDrop = statusRank(afterSeg?.status) < statusRank(beforeSeg?.status)
        const qualityDrop =
          beforeSeg?.qualityScore != null &&
          afterSeg?.qualityScore != null &&
          afterSeg.qualityScore + 1e-6 < beforeSeg.qualityScore
        return statusDrop || qualityDrop
      })
      .map(([label, beforeSeg, afterSeg]) => {
        const parts: string[] = [label]
        if (beforeSeg?.status !== afterSeg?.status) {
          parts.push(`${beforeSeg?.status ?? 'unknown'}->${afterSeg?.status ?? 'unknown'}`)
        }
        if (beforeSeg?.qualityScore != null && afterSeg?.qualityScore != null) {
          parts.push(
            `${Math.round(beforeSeg.qualityScore * 100)}->${Math.round(afterSeg.qualityScore * 100)}`
          )
        }
        return parts.join(' ')
      })

    return degraded.length > 0 ? degraded.join(' | ') : '总分下降但未定位到明确分段退化'
  }

  function applyActionCodeHint(actionCode: string, detail: string) {
    if (actionCode === 'repair_search_selectors_or_samples') {
      structuredHints.value = {
        ...structuredHints.value,
        searchResultSelector:
          structuredHints.value.searchResultSelector ||
          '.search-list > li | .result-list li | .bookbox | .result-item | a[href]',
      }
      let next = freeTextHints.value
      next = appendFreeTextHint(next, 'search result: 请确认条目容器与详情链接选择器')
      next = appendFreeTextHint(next, detail)
      freeTextHints.value = next
      return
    }
    if (actionCode === 'repair_book_title_author_selectors') {
      structuredHints.value = {
        ...structuredHints.value,
        bookTitleSelector:
          structuredHints.value.bookTitleSelector ||
          "h1 | .book-title | .title | .info h1 | meta[property='og:title']",
        authorSelector:
          structuredHints.value.authorSelector || '.author | .book-author | .info .author',
      }
      freeTextHints.value = appendFreeTextHint(freeTextHints.value, detail)
      return
    }
    if (actionCode === 'repair_toc_item_selector') {
      structuredHints.value = {
        ...structuredHints.value,
        tocItemSelector:
          structuredHints.value.tocItemSelector ||
          '.chapter-list a | #list a | .catalog a | a[href]',
      }
      freeTextHints.value = appendFreeTextHint(freeTextHints.value, detail)
      return
    }
    if (actionCode === 'repair_content_selector_and_noise_rules') {
      structuredHints.value = {
        ...structuredHints.value,
        contentSelector:
          structuredHints.value.contentSelector ||
          '#content | .content | .txtnav | .read-content | article',
        noisePatterns: Array.from(
          new Set([
            ...(structuredHints.value.noisePatterns || []),
            '最新网址',
            '推广',
            '广告',
            '手机阅读',
            '请收藏',
          ])
        ),
      }
      freeTextHints.value = appendFreeTextHint(freeTextHints.value, detail)
      return
    }
    let next = freeTextHints.value
    next = appendFreeTextHint(next, `action: ${actionCode}`)
    next = appendFreeTextHint(next, detail)
    freeTextHints.value = next
  }

  function applyRecommendedAction(actionCode: string, reason: string) {
    applyActionCodeHint(actionCode, `[Ops 推荐] ${reason}`)
    const sourceId = options.currentPackage.value?.source.id || ''
    if (
      sourceId &&
      ALLOWED_ACTION_CODES.has(actionCode as SourceFlowAssistSuggestion['actionCode'])
    ) {
      const preferred = dedupeActionCodes([
        actionCode,
        ...(aiAssistProfile.value?.preferredActions || []),
      ])
      void persistAiAssistProfile(sourceId, {
        preferredActions: preferred,
      })
    }
    success(`已应用推荐动作: ${actionCode}`)
  }

  async function applyRecommendedActionAndRefine(actionCode: string, reason: string) {
    applyActionCodeHint(actionCode, `[Ops 推荐] ${reason}`)
    await executeRefinePackage(`已应用推荐动作并修正: ${actionCode}`)
  }

  async function appendAiFeedbackStats(sourceId?: string) {
    if (!sourceId) return
    await ensureAiAssistProfile(sourceId)
    try {
      const response = await requestSourceFlowAssistFeedbackStats({ sourceId, days: 14 })
      if (!response.isSuccess || !response.data) return
      const stats = response.data
      const ratePct = Math.round(stats.acceptRate * 100)
      const deltaPct = Math.round(stats.avgDeltaScore * 100)
      aiAssistSummary.value = [
        ...aiAssistSummary.value,
        `feedback14d=${stats.accepted}/${stats.total} accepted (${ratePct}%)`,
        `avgScore=${Math.round(stats.avgBeforeScore * 100)}->${Math.round(stats.avgAfterScore * 100)} (delta=${deltaPct})`,
      ]
      if (stats.providers.length > 0) {
        const providerTop = stats.providers[0]
        aiAssistSummary.value.push(
          `topProvider=${providerTop.provider} ${providerTop.accepted}/${providerTop.count}`
        )
      }
      aiAssistOpsLeaderboard.value = stats.sourceLeaderboard || []
      aiAssistOpsRegressionTop.value = stats.regressionTop || []
      aiAssistOpsRecommendedActions.value = mergeRecommendedActions(
        stats.recommendedActions || [],
        aiAssistProfile.value?.preferredActions || []
      )
      if ((stats.sourceLeaderboard || []).length > 0) {
        const top = stats.sourceLeaderboard[0]
        aiAssistSummary.value.push(
          `topSource=${top.sourceId} accept=${Math.round(top.acceptRate * 100)}% delta=${Math.round(top.avgDeltaScore * 100)}`
        )
      }
      if ((stats.regressionTop || []).length > 0) {
        const top = stats.regressionTop[0]
        aiAssistSummary.value.push(`topRegression=${top.regression} (${top.count})`)
      }
      if ((stats.recommendedActions || []).length > 0) {
        const top = stats.recommendedActions[0]
        aiAssistSummary.value.push(`topAction=${top.actionCode} p=${top.priority}`)
      }
    } catch {
      // best effort only
    }
  }

  async function requestAiAssist() {
    const pkg = options.currentPackage.value
    if (!pkg) {
      warning('当前没有可分析的规则包')
      return
    }
    const query = validateSearchQuery.value.trim() || options.searchKeyword.value.trim()
    if (!query) {
      warning('请先填写 search keyword 或 validate search query')
      return
    }

    aiAssistLoading.value = true
    try {
      const response = await requestSourceFlowAssist({
        query,
        sourceId: pkg.source.id,
        blockers: pkg.readiness?.blockers ?? [],
        context: freeTextHints.value.trim().slice(0, 400),
      })
      if (!response.isSuccess || !response.data) {
        warning(response.errorMsg || 'Cloudflare AI 建议生成失败')
        return
      }

      const data = response.data
      aiAssistSummary.value = [
        `provider=${data.provider}`,
        `cache=${data.cached ? 'hit' : 'miss'}`,
        `normalizedQuery=${data.normalizedQuery || '--'}`,
        `suggestions=${data.suggestions.length}`,
      ]
      aiAssistMeta.value = {
        query,
        normalizedQuery: data.normalizedQuery,
        provider: data.provider,
        cached: data.cached,
      }
      aiAssistSuggestionActionCodeById.value = data.suggestions.reduce(
        (acc, item) => {
          acc[`cf-ai-${item.id}`] = item.actionCode
          return acc
        },
        {} as Record<string, SourceFlowAssistSuggestion['actionCode']>
      )
      if (!validateSearchQuery.value.trim() && data.normalizedQuery) {
        validateSearchQuery.value = data.normalizedQuery
      }
      aiAssistSuggestions.value = data.suggestions.map(item => ({
        id: `cf-ai-${item.id}`,
        step: 'cloudflare_ai',
        title: `[CF AI] ${item.title}`,
        detail: `${item.detail} (action=${item.actionCode})`,
        kind:
          item.actionCode === 'repair_search_selectors_or_samples' ||
          item.actionCode === 'repair_book_title_author_selectors' ||
          item.actionCode === 'repair_toc_item_selector' ||
          item.actionCode === 'repair_content_selector_and_noise_rules'
            ? 'structured'
            : 'free_text',
        applyLabel: '应用建议',
        apply: () => {
          applyActionCodeHint(item.actionCode, item.detail)
        },
      }))
      await appendAiFeedbackStats(pkg.source.id)
      success('Cloudflare AI 建议已生成')
    } catch {
      warning('Cloudflare AI 建议生成失败')
    } finally {
      aiAssistLoading.value = false
    }
  }

  async function requestAiAssistAndRefine() {
    await requestAiAssist()
    if (aiAssistSuggestions.value.length === 0) {
      warning('Cloudflare AI 未返回可用建议，未执行 refine')
      return
    }
    const beforePackage = options.currentPackage.value
      ? (JSON.parse(JSON.stringify(options.currentPackage.value)) as NxsSourcePackageDetail)
      : null
    const beforePackageJson = options.currentPackageJson.value
    const beforeScore = beforePackage?.validation?.score ?? 0
    const beforeStructuredHints = JSON.parse(
      JSON.stringify(structuredHints.value)
    ) as SourceRuleHints
    const beforeFreeTextHints = freeTextHints.value

    const retryPlans = AI_REFINE_RETRY_PLAN_SIZES.filter(
      size => !aiAssistProfile.value?.conservativeMode || size === 1
    )
      .map(size => aiAssistSuggestions.value.slice(0, size))
      .filter(plan => plan.length > 0)
      .filter((plan, index, list) => {
        const signature = plan.map(item => item.id).join('|')
        return (
          list.findIndex(candidate => candidate.map(item => item.id).join('|') === signature) ===
          index
        )
      })

    const attemptLogs: string[] = []
    const feedbackMeta = aiAssistMeta.value

    for (let attempt = 0; attempt < retryPlans.length; attempt++) {
      structuredHints.value = JSON.parse(JSON.stringify(beforeStructuredHints)) as SourceRuleHints
      freeTextHints.value = beforeFreeTextHints

      for (const suggestion of retryPlans[attempt]) {
        suggestion.apply()
      }

      const refined = await executeRefinePackage('已应用 Cloudflare AI 建议并完成修正', {
        silentSuccess: true,
      })
      if (!refined || !beforePackage || !options.previewPackage.value) {
        return
      }

      const afterScore = options.previewPackage.value.validation?.score ?? beforeScore
      if (afterScore + 1e-6 >= beforeScore) {
        const acceptedActionCodes = dedupeActionCodes(
          retryPlans[attempt]
            .map(item => aiAssistSuggestionActionCodeById.value[item.id])
            .filter((item): item is SourceFlowAssistSuggestion['actionCode'] => Boolean(item))
        )
        void requestSourceFlowAssistFeedback({
          runId: aiAssistRunId.value || undefined,
          sourceId: beforePackage.source.id,
          query:
            feedbackMeta?.query ||
            validateSearchQuery.value.trim() ||
            options.searchKeyword.value.trim(),
          normalizedQuery: feedbackMeta?.normalizedQuery,
          provider: feedbackMeta?.provider,
          cached: feedbackMeta?.cached,
          planSize: retryPlans[attempt].length,
          suggestionIds: retryPlans[attempt].map(item => item.id),
          beforeScore,
          afterScore,
          accepted: true,
        }).catch(() => {})
        attemptLogs.push(
          `attempt ${attempt + 1}: size=${retryPlans[attempt].length} score ${Math.round(beforeScore * 100)}->${Math.round(afterScore * 100)} accepted`
        )
        void persistAiAssistProfile(beforePackage.source.id, {
          lifecycleState: 'stable',
          preferredActions: dedupeActionCodes([
            ...acceptedActionCodes,
            ...(aiAssistProfile.value?.preferredActions || []),
          ]),
          conservativeMode: attempt > 0 ? true : (aiAssistProfile.value?.conservativeMode ?? false),
          lastGoodRunId: aiAssistRunId.value || aiAssistProfile.value?.lastGoodRunId || null,
        })
        aiAssistSummary.value = [...aiAssistSummary.value, ...attemptLogs]
        if (attempt === 0) {
          success('已应用 Cloudflare AI 建议并完成修正')
        } else {
          success('主建议组合掉分，已自动切换次优组合并完成修正')
        }
        void appendAiFeedbackStats(beforePackage.source.id)
        return
      }

      const regression = buildRegressionSummary(beforePackage, options.previewPackage.value)
      void requestSourceFlowAssistFeedback({
        runId: aiAssistRunId.value || undefined,
        sourceId: beforePackage.source.id,
        query:
          feedbackMeta?.query ||
          validateSearchQuery.value.trim() ||
          options.searchKeyword.value.trim(),
        normalizedQuery: feedbackMeta?.normalizedQuery,
        provider: feedbackMeta?.provider,
        cached: feedbackMeta?.cached,
        planSize: retryPlans[attempt].length,
        suggestionIds: retryPlans[attempt].map(item => item.id),
        beforeScore,
        afterScore,
        accepted: false,
        regression,
      }).catch(() => {})
      attemptLogs.push(
        `attempt ${attempt + 1}: size=${retryPlans[attempt].length} score ${Math.round(beforeScore * 100)}->${Math.round(afterScore * 100)} rollback (${regression})`
      )
      options.previewPackage.value = beforePackage
      options.previewPackageJson.value = beforePackageJson
      validationReport.value = {
        packageId: beforePackage.packageId,
        report: beforePackage.validation,
      }
      options.lastFetchDebug.value = buildFetchDebugFromPackage(beforePackage)

      if (attempt < retryPlans.length - 1) {
        warning(
          `AI 组合 ${attempt + 1} 掉分（${Math.round(beforeScore * 100)} -> ${Math.round(afterScore * 100)}，${regression}），自动重试次优组合`
        )
      } else {
        aiAssistSummary.value = [...aiAssistSummary.value, ...attemptLogs]
        const nextRecentFailureCodes = [
          regression,
          ...(aiAssistProfile.value?.recentFailureCodes || []),
        ]
        void persistAiAssistProfile(beforePackage.source.id, {
          lifecycleState: 'degraded',
          conservativeMode: true,
          recentFailureCodes: nextRecentFailureCodes.slice(0, 8),
        })
        warning(
          `AI 自动修正全部组合均掉分（${Math.round(beforeScore * 100)} -> ${Math.round(afterScore * 100)}，${regression}），已回滚`
        )
        void appendAiFeedbackStats(beforePackage.source.id)
      }
    }
  }

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

  async function executeRefinePackage(
    successMessage: string,
    execOptions: { silentSuccess?: boolean } = {}
  ) {
    if (!options.currentPackage.value) {
      warning('当前没有可修正的规则包')
      return false
    }
    const hasAutoRefineSignal = (options.currentPackage.value.validation?.steps ?? []).some(
      step => Boolean(step.failureCode) || step.manualReviewRecommended
    )
    if (!hasStructuredHints.value && !freeTextHints.value.trim() && !hasAutoRefineSignal) {
      warning('当前没有可用提示，也没有可自动修正的失败分类')
      return false
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
        return false
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
      if (!execOptions.silentSuccess) {
        success(successMessage)
      }
      return true
    } catch {
      warning('规则修正失败')
      return false
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
    aiAssistSummary.value = []
    aiAssistSuggestions.value = []
    aiAssistOpsLeaderboard.value = []
    aiAssistOpsRegressionTop.value = []
    aiAssistOpsRecommendedActions.value = []
    aiAssistMeta.value = null
    aiAssistRunId.value = null
    aiAssistProfile.value = null
    aiAssistProfileSourceId.value = null
    aiAssistSuggestionActionCodeById.value = {}
  }

  function setAiAssistRunId(runId: string | null) {
    aiAssistRunId.value = runId?.trim() || null
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
    applySnapshot,
    clearValidationRefineState,
  }
}
