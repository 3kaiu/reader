import { computed, type ComputedRef, type Ref } from 'vue'
import type {
  NxsSourcePackageDetail,
  SourceBuildDiagnostics,
  SourceFetchDebugInfo,
  SourceHealthSegment,
} from '@/api/sync'

type UseSourceBuilderSummariesOptions = {
  currentPackage: ComputedRef<NxsSourcePackageDetail | null>
  previewDiagnostics: Ref<SourceBuildDiagnostics | null>
  sourceBuildPreviewDiagnosticsItems: ComputedRef<string[]>
  lastFetchDebug: Ref<SourceFetchDebugInfo | null>
}

export function useSourceBuilderSummaries(
  options: UseSourceBuilderSummariesOptions
) {
  const currentDiagnosticsItems = computed(() => {
    const diagnostics = options.previewDiagnostics.value
    if (!diagnostics) {
      return options.sourceBuildPreviewDiagnosticsItems.value
    }
    return [
      `host: ${diagnostics.host}`,
      `book sample: ${diagnostics.bookSampleUrl}`,
      `chapter sample: ${diagnostics.chapterSampleUrl}`,
      `search strategy: ${diagnostics.searchStrategy}`,
      ...(options.currentPackage.value?.metadata?.['builder.searchRuleSource']
        ? [`search rule source: ${options.currentPackage.value.metadata['builder.searchRuleSource']}`]
        : []),
      ...(options.currentPackage.value?.metadata?.['builder.nativeSearchSupported']
        ? [`native search verified: ${options.currentPackage.value.metadata['builder.nativeSearchSupported']}`]
        : []),
      ...(options.currentPackage.value?.metadata?.['probe.searchEntryDetected']
        ? [`search entry detected: ${options.currentPackage.value.metadata['probe.searchEntryDetected']}`]
        : []),
      ...(options.currentPackage.value?.metadata?.['probe.searchEntryAction']
        ? [`search entry action: ${options.currentPackage.value.metadata['probe.searchEntryAction']}`]
        : []),
      ...(options.currentPackage.value?.metadata?.['probe.searchEntryMethod']
        ? [`search entry method: ${options.currentPackage.value.metadata['probe.searchEntryMethod']}`]
        : []),
      ...(options.currentPackage.value?.metadata?.['probe.searchEntryKeywordParam']
        ? [`search entry param: ${options.currentPackage.value.metadata['probe.searchEntryKeywordParam']}`]
        : []),
      ...(options.currentPackage.value?.metadata?.['probe.searchEntryFormSelector']
        ? [`search entry form: ${options.currentPackage.value.metadata['probe.searchEntryFormSelector']}`]
        : []),
      `fetch mode: ${diagnostics.fetchMode}`,
      `fetch provider: ${diagnostics.fetchProvider}`,
      ...(diagnostics.fetchServiceUrl ? [`fetch service: ${diagnostics.fetchServiceUrl}`] : []),
      `book fetch: ${diagnostics.bookFetchStatus} -> ${diagnostics.bookFinalUrl}`,
      `chapter fetch: ${diagnostics.chapterFetchStatus} -> ${diagnostics.chapterFinalUrl}`,
      ...(diagnostics.failureCategories.length > 0
        ? [`failure categories: ${diagnostics.failureCategories.join(', ')}`]
        : []),
      ...(diagnostics.preferredProbeInput
        ? [`preferred probe: ${diagnostics.preferredProbeInput}`]
        : []),
      ...(diagnostics.rawProbeScore != null
        ? [`raw probe score: ${Math.round(diagnostics.rawProbeScore * 100)}`]
        : []),
      ...(diagnostics.jinaProbeScore != null
        ? [`jina probe score: ${Math.round(diagnostics.jinaProbeScore * 100)}`]
        : []),
      ...(diagnostics.trafilaturaProbeScore != null
        ? [`trafilatura probe score: ${Math.round(diagnostics.trafilaturaProbeScore * 100)}`]
        : []),
      ...(diagnostics.aiReadabilityGain != null
        ? [`ai readability gain: ${Math.round(diagnostics.aiReadabilityGain * 100)}`]
        : []),
      ...(diagnostics.trafilaturaReadabilityGain != null
        ? [`trafilatura readability gain: ${Math.round(diagnostics.trafilaturaReadabilityGain * 100)}`]
        : []),
      ...(diagnostics.recommendedContentExtractor
        ? [`recommended extractor: ${diagnostics.recommendedContentExtractor}`]
        : []),
      ...((diagnostics.contentCandidateSummaries ?? []).map(item => `candidate: ${item}`)),
      ...(diagnostics.jinaSearchUsed ? ['external discovery fallback: jina_search'] : []),
      `generalization: ${Math.round((diagnostics.generalizationScore ?? 0) * 100)}`,
      `same-site candidates: ${diagnostics.sameSiteCandidateCount ?? 0}`,
      ...(diagnostics.sameSiteValidationScore != null
        ? [`same-site validation: ${Math.round(diagnostics.sameSiteValidationScore * 100)}`]
        : []),
      ...(diagnostics.sameSiteValidatedUrl
        ? [`same-site validated url: ${diagnostics.sameSiteValidatedUrl}`]
        : []),
      ...(diagnostics.searchInferenceScore != null
        ? [`search inference: ${Math.round(diagnostics.searchInferenceScore * 100)}`]
        : []),
      ...(diagnostics.searchDetailPassed != null
        ? [`search detail: ${diagnostics.searchDetailPassed ? 'pass' : 'fail'}`]
        : []),
      ...(diagnostics.searchDetailFailureCode
        ? [`search detail code: ${diagnostics.searchDetailFailureCode}`]
        : []),
      ...(diagnostics.searchDetailSummary
        ? [`search detail summary: ${diagnostics.searchDetailSummary}`]
        : []),
      ...(diagnostics.searchDetailValidatedUrl
        ? [`search detail url: ${diagnostics.searchDetailValidatedUrl}`]
        : []),
      ...(diagnostics.searchDetailResolvedName
        ? [`search detail name: ${diagnostics.searchDetailResolvedName}`]
        : []),
      ...(options.currentPackage.value?.metadata?.['probe.searchItemNameSelector']
        ? [`search item.name: ${options.currentPackage.value.metadata['probe.searchItemNameSelector']}`]
        : []),
      ...(options.currentPackage.value?.metadata?.['probe.searchItemUrlSelector']
        ? [`search item.url: ${options.currentPackage.value.metadata['probe.searchItemUrlSelector']}`]
        : []),
      ...(options.currentPackage.value?.metadata?.['probe.searchResultFilter']
        ? [`search result filter: ${options.currentPackage.value.metadata['probe.searchResultFilter']}`]
        : []),
      ...(options.currentPackage.value?.metadata?.['probe.searchNextPageSelector']
        ? [`search next page: ${options.currentPackage.value.metadata['probe.searchNextPageSelector']}`]
        : []),
      ...(options.currentPackage.value?.metadata?.['probe.searchItemAuthorSelector']
        ? [`search item.author: ${options.currentPackage.value.metadata['probe.searchItemAuthorSelector']}`]
        : []),
      ...(options.currentPackage.value?.metadata?.['probe.searchItemIntroSelector']
        ? [`search item.intro: ${options.currentPackage.value.metadata['probe.searchItemIntroSelector']}`]
        : []),
      ...diagnostics.searchDetailWarnings.map(item => `search-detail warn: ${item}`),
      ...diagnostics.sameSiteValidationWarnings.map(item => `same-site warn: ${item}`),
      ...diagnostics.suggestedFixes.map(item => `fix: ${item}`),
    ]
  })

  const currentPreviewSummary = computed(() => {
    const pkg = options.currentPackage.value
    const health = pkg?.validation?.health
    const segmentItems = health
      ? ([
          ['搜索', health.search],
          ['详情', health.book],
          ['目录', health.toc],
          ['正文', health.content],
        ] as Array<[string, SourceHealthSegment]>).map(([label, segment]) => {
          const parts = [label, segment.status]
          if (segment.qualityScore != null) {
            parts.push(`quality=${Math.round(segment.qualityScore * 100)}`)
          }
          if (segment.failureCode) {
            parts.push(`code=${segment.failureCode}`)
          }
          return parts.join(' · ')
        })
      : []

    return {
      hasPreview: Boolean(pkg),
      sourceLabel: pkg ? `${pkg.source.name} (${pkg.source.id})` : '--',
      packageId: pkg?.packageId ?? '--',
      validationLabel: pkg?.validation
        ? `${pkg.validation.valid ? '通过' : '失败'} / ${Math.round((pkg.validation.score ?? 0) * 100)}`
        : '--',
      healthLabel: health?.recommended ? '推荐' : '需复核',
      healthScoreLabel: health ? `${Math.round((health.overallScore ?? 0) * 100)}` : '--',
      segmentItems,
      importable: Boolean(pkg?.validation?.importable),
    }
  })

  const fetchDebugSummary = computed(() => {
    const debug = options.lastFetchDebug.value
    if (!debug) {
      return []
    }
    return [
      `mode: ${debug.mode}`,
      `provider: ${debug.provider}`,
      ...(debug.serviceUrl ? [`service: ${debug.serviceUrl}`] : []),
      ...(debug.engine ? [`engine: ${debug.engine}`] : []),
      ...(debug.respondWith ? [`respond with: ${debug.respondWith}`] : []),
      ...(debug.sessionKey ? [`session: ${debug.sessionKey}`] : []),
      `jina: ${debug.jinaUsed ? 'yes' : 'no'}`,
      `cache hit: ${debug.cacheHit ? 'yes' : 'no'}`,
      ...(debug.sessionState ? [`session state: ${debug.sessionState}`] : []),
      ...(debug.requestUrl ? [`request: ${debug.requestUrl}`] : []),
      ...(debug.finalUrl ? [`final: ${debug.finalUrl}`] : []),
      ...(debug.httpStatus != null ? [`status: ${debug.httpStatus}`] : []),
    ]
  })

  const searchProfileSummary = computed(() => {
    const profile = options.currentPackage.value?.searchProfile
    if (!profile) {
      return []
    }

    return profile.strategies.map(strategy => ({
      id: strategy.id,
      mode: strategy.mode,
      enabled: strategy.enabled,
      priority: strategy.priority,
      provider: strategy.provider,
      note:
        strategy.disabledReason ||
        (strategy.pagination?.enabled && strategy.pagination.nextPageSelector
          ? `next=${strategy.pagination.nextPageSelector}`
          : null) ||
        strategy.queryTemplate ||
        strategy.detailUrlTemplate ||
        '--',
    }))
  })

  const fetchProfileSummary = computed(() => {
    const profile = options.currentPackage.value?.fetchProfile
    if (!profile) {
      return '--'
    }
    const parts = [profile.mode, profile.provider]
    if (profile.serviceUrl) {
      parts.push(profile.serviceUrl)
    }
    if (profile.engine) {
      parts.push(`engine=${profile.engine}`)
    }
    if (profile.sessionKey) {
      parts.push(`session=${profile.sessionKey}`)
    }
    return parts.join(' · ')
  })

  return {
    currentDiagnosticsItems,
    currentPreviewSummary,
    fetchDebugSummary,
    searchProfileSummary,
    fetchProfileSummary,
  }
}
