import { computed, type ComputedRef, type Ref } from 'vue'
import type {
  NxsSourcePackageDetail,
  SourceBuildDiagnostics,
  SourceFetchDebugInfo,
  SourceHealthSegment,
} from '@/api/sync'
import { buildSourceBuilderDiagnosticsItems } from '@/composables/source-builder/sourceBuilderDiagnosticsSummary'

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
    return buildSourceBuilderDiagnosticsItems(diagnostics, options.currentPackage.value)
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
      readinessBlockers: pkg?.readiness?.blockers ?? [],
      readinessSuggestedActions: pkg?.readiness?.suggestedActions ?? [],
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
