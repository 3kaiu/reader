import { syncApi } from '@/api/sync'
import type {
  FetchHtmlResponse,
  NxsSourcePackageDetail,
  SourceFlowAssistProfile,
  SourceFlowLifecycleState,
  SourceBuildDiagnostics,
  SourceDebugPresetInputs,
  SourceFetchDebugInfo,
  SourceRuleHints,
  SourceRuleRefineResponse,
  ValidateSourcePackageResponse,
} from '@/api/sync'
import type { SourceBuilderDebugSnapshot } from '@/composables/source-builder/types'

type SnapshotContext = Pick<
  SourceBuilderDebugSnapshot,
  'sourceLabel' | 'sessionKey' | 'bookCurl' | 'chapterCurl' | 'searchCurl' | 'searchKeyword'
>

type BuildValidationRefineSamplesOptions = {
  searchQuery: string
  bookUrl: string
  tocUrl: string
  chapterUrl: string
}

type ValidationSnapshotOptions = {
  snapshotContext: SnapshotContext
  packageData: NxsSourcePackageDetail | null
  packageJson: string
  diagnostics: SourceBuildDiagnostics | null
  validationReport: ValidateSourcePackageResponse | null
  fetchDebug: SourceFetchDebugInfo | null
  fetchHtmlPreview: FetchHtmlResponse | null
}

type RefineSnapshotOptions = {
  snapshotContext: SnapshotContext
  packageData: NxsSourcePackageDetail
  packageJson: string
  diagnostics: SourceBuildDiagnostics | null
  fetchDebug: SourceFetchDebugInfo | null
  fetchHtmlPreview: FetchHtmlResponse | null
}

export function buildValidationRefineSamples(
  options: BuildValidationRefineSamplesOptions
): SourceDebugPresetInputs {
  return {
    ...(options.searchQuery.trim() ? { searchQuery: options.searchQuery.trim() } : {}),
    ...(options.bookUrl.trim() ? { bookUrl: options.bookUrl.trim() } : {}),
    ...(options.tocUrl.trim() ? { tocUrl: options.tocUrl.trim() } : {}),
    ...(options.chapterUrl.trim() ? { chapterUrl: options.chapterUrl.trim() } : {}),
  }
}

export async function validateSourceBuilderPackage(
  sourcePackage: NxsSourcePackageDetail,
  samples: SourceDebugPresetInputs
) {
  return await syncApi.validateSourcePackage(sourcePackage, samples)
}

export async function refineSourceBuilderPackage(options: {
  sourcePackage: NxsSourcePackageDetail
  structuredHints: SourceRuleHints | null
  freeTextHints: string
  samples: SourceDebugPresetInputs
}) {
  return await syncApi.refineSourcePackage({
    package: options.sourcePackage,
    ...(options.structuredHints ? { structuredHints: { ...options.structuredHints } } : {}),
    ...(options.freeTextHints.trim() ? { freeTextHints: options.freeTextHints.trim() } : {}),
    samples: options.samples,
    emitPackageJson: true,
  })
}

export async function requestSourceFlowAssist(options: {
  query: string
  sourceId?: string
  blockers?: string[]
  context?: string
}) {
  return await syncApi.sourceFlowAssist({
    query: options.query,
    sourceId: options.sourceId,
    blockers: options.blockers,
    context: options.context,
  })
}

export async function requestSourceFlowAssistFeedback(options: {
  runId?: string
  sourceId?: string
  query?: string
  normalizedQuery?: string
  provider?: string
  cached?: boolean
  planSize: number
  suggestionIds: string[]
  beforeScore: number
  afterScore: number
  accepted: boolean
  regression?: string
}) {
  return await syncApi.sourceFlowAssistFeedback({
    runId: options.runId,
    sourceId: options.sourceId,
    query: options.query,
    normalizedQuery: options.normalizedQuery,
    provider: options.provider,
    cached: options.cached,
    planSize: options.planSize,
    suggestionIds: options.suggestionIds,
    beforeScore: options.beforeScore,
    afterScore: options.afterScore,
    accepted: options.accepted,
    regression: options.regression,
  })
}

export async function requestSourceFlowAssistFeedbackStats(options: {
  sourceId?: string
  days?: number
}) {
  return await syncApi.getSourceFlowAssistFeedbackStats({
    sourceId: options.sourceId,
    days: options.days,
  })
}

export async function requestSourceFlowAssistProfile(options: { sourceId: string }) {
  return await syncApi.getSourceFlowAssistProfile(options.sourceId)
}

export async function saveSourceFlowAssistProfile(options: {
  sourceId: string
  lifecycleState?: SourceFlowLifecycleState
  preferredActions?: SourceFlowAssistProfile['preferredActions']
  conservativeMode?: boolean
  lastGoodRunId?: string | null
  recentFailureCodes?: string[]
}) {
  return await syncApi.saveSourceFlowAssistProfile(options)
}

export async function resetSourceFlowAssistProfile(options: {
  sourceId: string
  lifecycleState?: 'new' | 'warming'
  clearPreferredActions?: boolean
}) {
  return await syncApi.resetSourceFlowAssistProfile(options)
}

export function buildFetchDebugFromPackage(
  sourcePackage: NxsSourcePackageDetail
): SourceFetchDebugInfo | null {
  const fetchProfile = sourcePackage.fetchProfile
  if (!fetchProfile) {
    return null
  }

  return {
    mode: fetchProfile.mode,
    provider: fetchProfile.provider,
    serviceUrl: fetchProfile.serviceUrl,
    engine: fetchProfile.engine,
    sessionKey: fetchProfile.sessionKey,
    cacheHit: false,
    sessionState: fetchProfile.sessionKey ? 'active' : 'none',
    jinaUsed: fetchProfile.provider === 'jina_reader',
    respondWith: fetchProfile.engine,
  }
}

export function buildValidationSnapshot(options: ValidationSnapshotOptions) {
  return {
    kind: 'validate' as const,
    title: 'Validate package',
    ...options.snapshotContext,
    packageData: options.packageData,
    packageJson: options.packageJson || undefined,
    diagnostics: options.diagnostics,
    validationReport: options.validationReport,
    fetchDebug: options.fetchDebug,
    fetchHtmlPreview: options.fetchHtmlPreview,
  }
}

export function buildRefineSnapshot(options: RefineSnapshotOptions) {
  return {
    kind: 'refine' as const,
    title: 'Refine package',
    ...options.snapshotContext,
    packageData: options.packageData,
    packageJson: options.packageJson || undefined,
    diagnostics: options.diagnostics,
    validationReport: {
      packageId: options.packageData.packageId,
      report: options.packageData.validation,
    },
    fetchDebug: options.fetchDebug,
    fetchHtmlPreview: options.fetchHtmlPreview,
  }
}

export function applyValidatedPreviewPackage(options: {
  previewPackage: NxsSourcePackageDetail | null
  validationReport: ValidateSourcePackageResponse | null
}): NxsSourcePackageDetail | null {
  if (!options.previewPackage || !options.validationReport?.report) {
    return options.previewPackage
  }

  return {
    ...options.previewPackage,
    validation: options.validationReport.report,
  }
}

export function applyRefinedPackageResult(response: SourceRuleRefineResponse) {
  return {
    packageData: response.package,
    packageJson: response.packageJson ?? JSON.stringify(response.package, null, 2),
    autoActions: response.autoAppliedActions,
    appliedHints: response.appliedHints,
    changes: response.changes ?? [],
    validationReport: {
      packageId: response.package.packageId,
      report: response.package.validation,
    },
  }
}
