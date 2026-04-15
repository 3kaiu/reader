import type { NxsSourcePackageDetail, SourceBuildDiagnostics } from '@/api/sync'

function readMetadata(
  currentPackage: NxsSourcePackageDetail | null,
  key: string
): string | undefined {
  const value = currentPackage?.metadata?.[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function metadataLine(
  currentPackage: NxsSourcePackageDetail | null,
  key: string,
  label: string
): string[] {
  const value = readMetadata(currentPackage, key)
  return value ? [`${label}: ${value}`] : []
}

export function buildSourceBuilderDiagnosticsItems(
  diagnostics: SourceBuildDiagnostics,
  currentPackage: NxsSourcePackageDetail | null
): string[] {
  return [
    `host: ${diagnostics.host}`,
    `book sample: ${diagnostics.bookSampleUrl}`,
    `chapter sample: ${diagnostics.chapterSampleUrl}`,
    `search strategy: ${diagnostics.searchStrategy}`,
    ...metadataLine(currentPackage, 'builder.searchRuleSource', 'search rule source'),
    ...metadataLine(currentPackage, 'builder.nativeSearchSupported', 'native search verified'),
    ...metadataLine(currentPackage, 'probe.searchEntryDetected', 'search entry detected'),
    ...metadataLine(currentPackage, 'probe.searchEntryAction', 'search entry action'),
    ...metadataLine(currentPackage, 'probe.searchEntryMethod', 'search entry method'),
    ...metadataLine(currentPackage, 'probe.searchEntryKeywordParam', 'search entry param'),
    ...metadataLine(currentPackage, 'probe.searchEntryFormSelector', 'search entry form'),
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
      ? [
          `trafilatura readability gain: ${Math.round(diagnostics.trafilaturaReadabilityGain * 100)}`,
        ]
      : []),
    ...(diagnostics.recommendedContentExtractor
      ? [`recommended extractor: ${diagnostics.recommendedContentExtractor}`]
      : []),
    ...(diagnostics.contentCandidateSummaries ?? []).map(item => `candidate: ${item}`),
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
    ...metadataLine(currentPackage, 'probe.searchItemNameSelector', 'search item.name'),
    ...metadataLine(currentPackage, 'probe.searchItemUrlSelector', 'search item.url'),
    ...metadataLine(currentPackage, 'probe.searchResultFilter', 'search result filter'),
    ...metadataLine(currentPackage, 'probe.searchNextPageSelector', 'search next page'),
    ...metadataLine(currentPackage, 'probe.searchItemAuthorSelector', 'search item.author'),
    ...metadataLine(currentPackage, 'probe.searchItemIntroSelector', 'search item.intro'),
    ...diagnostics.searchDetailWarnings.map(item => `search-detail warn: ${item}`),
    ...diagnostics.sameSiteValidationWarnings.map(item => `same-site warn: ${item}`),
    ...diagnostics.suggestedFixes.map(item => `fix: ${item}`),
  ]
}
