import { $delete, $get, $patch, $post, type ApiFetchOptions } from "./client"

type RoutingLatencySummary = {
  samples: number
  p50: number
  p95: number
  avg: number
}

export type ClientRoutingAnalytics = {
  window: string
  routeCounts: Record<string, number>
  routeSharePct: Record<string, number>
  latencySummary: Record<string, RoutingLatencySummary>
  note?: string
}

export type AgentRouterStats = {
  window: string
  totalSelections: number
  strategyCounts: Record<string, number>
  strategySharePct: Record<string, number>
  strategyConfidence: Record<string, { avg: number; samples: number }>
  skillCounts: Record<string, number>
  summary: {
    aiAttemptRatePct: number
    fallbackRatePct: number
    aiTimeoutRatePct: number
  }
}

export type AgentRouterConfigSnapshot = {
  window: string
  source?: 'env' | 'env+override'
  overrideUpdatedAt?: string | null
  overrideUpdatedBy?: string | null
  config: {
    enabled: boolean
    shadowMode: boolean
    allowAISelection: boolean
    aiMaxLatencyMs: number
    minConfidence: number
    rolloutPercent: number
    includeRoutes: string[]
    excludeRoutes: string[]
  }
}

export type AgentRouterConfigPatch = Partial<AgentRouterConfigSnapshot['config']>

export type AgentRouterConfigAuditRecord = {
  id: string
  action: 'patch' | 'reset'
  actorId?: string
  timestamp: string
  patch?: AgentRouterConfigPatch
  changes: Array<{
    field: keyof AgentRouterConfigSnapshot['config']
    before: unknown
    after: unknown
  }>
}

export type SourcePackageSummary = {
  sourceId: string
  sourceName: string
  host: string
  packageId: string
  generatedAtMs: number
  enabled: boolean
  valid: boolean
  tags: string[]
}

export type SourceDocumentation = {
  siteSummary?: string
  pageModel?: string
  bookPageNotes?: string
  chapterPageNotes?: string
  contentNoiseNotes?: string[]
  knownRisks?: string[]
  recommendedUsage?: string
}

export type SourceBuildSamples = {
  bookSampleUrl?: string
  chapterSampleUrl?: string
  bookSampleFingerprint?: string
  chapterSampleFingerprint?: string
}

export type SourceCapabilityMatrix = {
  searchSupported: boolean
  bookSupported: boolean
  tocSupported: boolean
  contentSupported: boolean
  directDetailSupported: boolean
  externalDiscoverySupported: boolean
  searchPaginationSupported: boolean
  searchSpecialParamSupported: boolean
  paginationSupported: boolean
  fontDecryptSupported: boolean
  scriptCleanSupported: boolean
}

export type SourceSearchMode = 'native_search' | 'direct_detail' | 'external_discovery'

export type SearchPaginationRule = {
  enabled: boolean
  nextPageSelector?: string | null
  maxPages: number
}

export type SearchStrategyRule = {
  id: string
  mode: SourceSearchMode
  enabled: boolean
  priority: number
  provider: string
  queryTemplate?: string | null
  method?: string | null
  bodyTemplate?: string | null
  resultSelector?: string | null
  detailUrlTemplate?: string | null
  bookUrlMatchers: string[]
  pagination: SearchPaginationRule
  disabledReason?: string | null
}

export type SourceSearchProfile = {
  enabled: boolean
  defaultMode?: SourceSearchMode | null
  strategies: SearchStrategyRule[]
}

export type SourceImportPolicy = {
  enabledByDefault: boolean
  priority: number
  allowSearch: boolean
  allowRead: boolean
  visibility: string
}

export type SourceFetchProfile = {
  mode: string
  provider: string
  serviceUrl?: string | null
  engine?: string | null
  sessionKey?: string | null
  note?: string | null
}

export type SourceRuleHints = {
  searchEntry?: string | null
  searchResultSelector?: string | null
  bookTitleSelector?: string | null
  authorSelector?: string | null
  introSelector?: string | null
  tocItemSelector?: string | null
  contentSelector?: string | null
  contentTitleSelector?: string | null
  noisePatterns: string[]
  paginationSelector?: string | null
}

export type SourceRuleValidationReport = {
  valid: boolean
  compileOk: boolean
  warnings: string[]
  errors: string[]
  score: number
  steps: SourceValidationStepReport[]
  importable: boolean
  manualReviewRequired: boolean
}

export type SourceValidationStepReport = {
  step: string
  ok: boolean
  summary: string
  failureCode?: string | null
  warnings: string[]
  errors: string[]
  itemCount?: number | null
  qualityScore?: number | null
  suggestedActions: string[]
  manualReviewRecommended: boolean
}

export type NxsSourcePackageDetail = {
  packageId: string
  engineVersion: string
  generatedAtMs: number
  generator: string
  source: {
    id: string
    name: string
    url: string
  }
  validation: SourceRuleValidationReport
  tags: string[]
  metadata: Record<string, string>
  documentation?: SourceDocumentation | null
  samples?: SourceBuildSamples | null
  capabilities?: SourceCapabilityMatrix | null
  importPolicy?: SourceImportPolicy | null
  searchProfile?: SourceSearchProfile | null
  fetchProfile?: SourceFetchProfile | null
}

export type ImportSourcePackageResponse = {
  sourceId: string
  packageId: string
  imported: boolean
  compileReady: boolean
  importable: boolean
}

export type SourceBuildDiagnostics = {
  host: string
  bookSampleUrl: string
  chapterSampleUrl: string
  searchStrategy: string
  fetchMode: string
  fetchProvider: string
  fetchServiceUrl?: string | null
  bookFetchStatus: number
  chapterFetchStatus: number
  bookFinalUrl: string
  chapterFinalUrl: string
  generalizationScore: number
  sameSiteValidationScore?: number | null
  sameSiteCandidateCount: number
  sameSiteValidatedUrl?: string | null
  sameSiteValidationWarnings: string[]
  searchInferenceScore?: number | null
  searchDetailValidatedUrl?: string | null
  searchDetailResolvedName?: string | null
  searchDetailPassed?: boolean | null
  searchDetailFailureCode?: string | null
  searchDetailSummary?: string | null
  searchDetailWarnings: string[]
  selectorStabilityWarnings: string[]
  noisePatternsDetected: string[]
  riskFlags: string[]
  suggestedFixes: string[]
  failureCategories: string[]
}

export type SourceFetchDebugInfo = {
  mode: string
  provider: string
  serviceUrl?: string | null
  engine?: string | null
  requestUrl?: string | null
  finalUrl?: string | null
  httpStatus?: number | null
  sessionKey?: string | null
  cacheHit: boolean
  sessionState?: string | null
}

export type FetchSessionProfile = {
  sessionKey: string
  label?: string | null
  cookies: Record<string, string>
  headers: Record<string, string>
  userAgent?: string | null
  referer?: string | null
  createdAtMs: number
  expiresAtMs: number
  hitCount: number
}

export type FetchSessionImportResponse = {
  session: FetchSessionProfile
  imported: boolean
}

export type FetchHtmlResponse = {
  status: number
  finalUrl: string
  html: string
  cacheHit: boolean
  cacheSource: string
  cachedAtMs?: number | null
  expiresAtMs?: number | null
  ttlRemainingMs?: number | null
  sessionState: string
  fetchDebug: SourceFetchDebugInfo
}

export type SourceBuildFromSamplesResponse = {
  package: NxsSourcePackageDetail
  packageJson?: string | null
  diagnostics: SourceBuildDiagnostics
}

export type ValidateSourcePackageResponse = {
  packageId: string
  report: SourceRuleValidationReport
  fetchDebug?: SourceFetchDebugInfo | null
}

export type SourceDebugPresetInputs = {
  searchQuery?: string
  bookUrl?: string
  tocUrl?: string
  chapterUrl?: string
}

export type SourceRuleRefineResponse = {
  package: NxsSourcePackageDetail
  packageJson?: string | null
  autoAppliedActions: string[]
  appliedHints: string[]
  changes: Array<{
    path: string
    before?: string | null
    after?: string | null
  }>
}

export type RunByPackageResponse = {
  packageId: string
  operation: string
  result: unknown
  step?: SourceValidationStepReport | null
  fetchDebug?: SourceFetchDebugInfo | null
}

export const syncApi = {
  getClientRoutingAnalytics: async () => {
    return await $get<ClientRoutingAnalytics>("/analytics/client-routing", {
      silent: true,
    } satisfies ApiFetchOptions)
  },
  getAgentRouterStats: async () => {
    return await $get<AgentRouterStats>("/agent/router-stats", {
      silent: true,
    } satisfies ApiFetchOptions)
  },
  getAgentRouterConfig: async () => {
    return await $get<AgentRouterConfigSnapshot>("/agent/config", {
      silent: true,
    } satisfies ApiFetchOptions)
  },
  updateAgentRouterConfig: async (patch: AgentRouterConfigPatch) => {
    return await $patch<{
      success: boolean
      updatedAt: string
      updatedBy?: string | null
      config: AgentRouterConfigSnapshot['config']
    }>("/agent/config", patch, {
      silent: true,
    } satisfies ApiFetchOptions)
  },
  resetAgentRouterConfig: async () => {
    return await $delete<{
      success: boolean
      cleared: boolean
      config: AgentRouterConfigSnapshot['config']
    }>("/agent/config", {
      silent: true,
    } satisfies ApiFetchOptions)
  },
  getAgentRouterConfigAudit: async (limit = 20, cursor?: string | null) => {
    const params = new URLSearchParams()
    params.set("limit", String(Math.max(1, Math.min(100, limit))))
    if (cursor) {
      params.set("cursor", cursor)
    }
    return await $get<{
      window: string
      count: number
      nextCursor: string | null
      records: AgentRouterConfigAuditRecord[]
    }>(`/agent/config/audit?${params.toString()}`, {
      silent: true,
    } satisfies ApiFetchOptions)
  },
  listSourcePackages: async () => {
    return await $get<SourcePackageSummary[]>("/source-packages", {
      silent: true,
    } satisfies ApiFetchOptions)
  },
  getSourcePackage: async (sourceId: string) => {
    return await $get<NxsSourcePackageDetail>(`/source-packages/${encodeURIComponent(sourceId)}`, {
      silent: true,
    } satisfies ApiFetchOptions)
  },
  importSourcePackage: async (packageJson: string) => {
    return await $post<ImportSourcePackageResponse>(
      "/source-packages/import",
      {
        package: JSON.parse(packageJson),
      },
      {
        silent: true,
      } satisfies ApiFetchOptions
    )
  },
  deleteSourcePackage: async (sourceId: string) => {
    return await $delete<{ sourceId: string; deleted: boolean }>(
      `/source-packages/${encodeURIComponent(sourceId)}`,
      {
        silent: true,
      } satisfies ApiFetchOptions
    )
  },
  buildSourcePackageFromSamples: async (payload: {
    bookCurl: string
    chapterCurl: string
    searchCurl?: string
    siteEntryCurl?: string
    searchKeyword?: string
    sourceId?: string
    sourceName?: string
    tags?: string[]
    emitPackageJson?: boolean
    fetchMode?: string
    fetchProvider?: string
    fetchServiceUrl?: string
    fetchEngine?: string
    fetchSessionKey?: string
    structuredHints?: SourceRuleHints
    freeTextHints?: string
  }) => {
    return await $post<SourceBuildFromSamplesResponse>(
      "/source-builder/build-from-samples",
      payload,
      {
        silent: true,
      } satisfies ApiFetchOptions
    )
  },
  validateSourcePackage: async (
    packageDetail: unknown,
    samples?: SourceDebugPresetInputs
  ) => {
    return await $post<ValidateSourcePackageResponse>(
      "/source-builder/validate",
      {
        package: packageDetail,
        ...(samples ? { samples } : {}),
      },
      {
        silent: true,
      } satisfies ApiFetchOptions
    )
  },
  refineSourcePackage: async (payload: {
    package: unknown
    structuredHints?: SourceRuleHints
    freeTextHints?: string
    samples?: SourceDebugPresetInputs
    emitPackageJson?: boolean
  }) => {
    return await $post<SourceRuleRefineResponse>(
      "/source-builder/refine",
      payload,
      {
        silent: true,
      } satisfies ApiFetchOptions
    )
  },
  runEngineByPackage: async (payload: {
    package: unknown
    operation: 'search' | 'book_info' | 'chapters' | 'content'
    query?: string
    targetUrl?: string
  }) => {
    return await $post<RunByPackageResponse>("/engine/run-by-package", payload, {
      silent: true,
    } satisfies ApiFetchOptions)
  },
  importFetchSession: async (payload: {
    sessionKey: string
    label?: string
    cookies?: Record<string, string>
    headers?: Record<string, string>
    userAgent?: string
    referer?: string
    ttlSeconds?: number
  }) => {
    return await $post<FetchSessionImportResponse>('/fetch/session/import', payload, {
      silent: true,
    } satisfies ApiFetchOptions)
  },
  getFetchSession: async (sessionKey: string) => {
    return await $get<FetchSessionProfile>(`/fetch/session/${encodeURIComponent(sessionKey)}`, {
      silent: true,
    } satisfies ApiFetchOptions)
  },
  fetchHtmlWithSession: async (payload: {
    url: string
    method?: string
    body?: string
    headers?: Record<string, string>
    sessionKey?: string
    forceRefresh?: boolean
    cacheTtlSeconds?: number
  }) => {
    return await $post<FetchHtmlResponse>('/fetch/html', payload, {
      silent: true,
    } satisfies ApiFetchOptions)
  },
}
