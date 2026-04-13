import { $delete, $get, $patch, $post, type ApiFetchOptions } from './client'

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
  readinessState:
    | 'draft'
    | 'blocked'
    | 'search_ready'
    | 'catalog_ready'
    | 'reading_ready'
    | 'full_flow_ready'
  searchable: boolean
  detailReady: boolean
  tocReady: boolean
  readable: boolean
  overallHealthScore: number
  recommended: boolean
  searchStatus: 'pass' | 'warn' | 'fail' | 'unknown'
  bookStatus: 'pass' | 'warn' | 'fail' | 'unknown'
  tocStatus: 'pass' | 'warn' | 'fail' | 'unknown'
  contentStatus: 'pass' | 'warn' | 'fail' | 'unknown'
  tags: string[]
}

export type SourceReadinessReport = {
  state:
    | 'draft'
    | 'blocked'
    | 'search_ready'
    | 'catalog_ready'
    | 'reading_ready'
    | 'full_flow_ready'
  searchable: boolean
  detailReady: boolean
  tocReady: boolean
  readable: boolean
  importable: boolean
  blockers: string[]
  warnings: string[]
  suggestedActions: string[]
  summary?: string | null
}

export type SourceHealthStatus = 'pass' | 'warn' | 'fail' | 'unknown'

export type SourceHealthSegment = {
  status: SourceHealthStatus
  qualityScore?: number | null
  failureCode?: string | null
  warnings: string[]
  lastValidatedAtMs?: number | null
}

export type SourceHealthReport = {
  overallScore: number
  recommended: boolean
  search: SourceHealthSegment
  book: SourceHealthSegment
  toc: SourceHealthSegment
  content: SourceHealthSegment
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
  health: SourceHealthReport
  lastValidatedAtMs?: number | null
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
  readiness: SourceReadinessReport
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
  readinessState:
    | 'draft'
    | 'blocked'
    | 'search_ready'
    | 'catalog_ready'
    | 'reading_ready'
    | 'full_flow_ready'
}

export type SourceFlowAssistSuggestion = {
  id: string
  title: string
  detail: string
  actionCode:
    | 'run_validation_with_samples'
    | 'fix_rule_compile_errors'
    | 'repair_search_selectors_or_samples'
    | 'repair_book_title_author_selectors'
    | 'repair_toc_item_selector'
    | 'repair_content_selector_and_noise_rules'
  priority: number
}

export type SourceFlowAssistResponse = {
  success: boolean
  cached: boolean
  provider: 'workers-ai' | 'ai-gateway' | 'none'
  generatedAtMs: number
  normalizedQuery: string
  suggestions: SourceFlowAssistSuggestion[]
}

export type SourceFlowAssistFeedbackRequest = {
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
}

export type SourceFlowAssistFeedbackStatsResponse = {
  success: boolean
  windowDays: number
  sourceId?: string
  total: number
  accepted: number
  acceptRate: number
  avgBeforeScore: number
  avgAfterScore: number
  avgDeltaScore: number
  providers: Array<{
    provider: string
    count: number
    accepted: number
    acceptRate: number
  }>
  sourceLeaderboard: Array<{
    sourceId: string
    count: number
    accepted: number
    acceptRate: number
    avgDeltaScore: number
    regressionCount: number
  }>
  regressionTop: Array<{
    regression: string
    count: number
  }>
  recommendedActions: Array<{
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
  recentRegressions: string[]
}

export type SourceFlowLifecycleState = 'new' | 'warming' | 'stable' | 'degraded' | 'quarantined'

export type SourceFlowAssistProfile = {
  sourceId: string
  lifecycleState: SourceFlowLifecycleState
  preferredActions: SourceFlowAssistSuggestion['actionCode'][]
  conservativeMode: boolean
  lastGoodRunId?: string | null
  recentFailureCodes: string[]
  updatedAt: string
}

export type SourceFlowAssistProfileAuditEntry = {
  id: number
  sourceId: string
  action: string
  lifecycleState?: string
  conservativeMode?: boolean
  note?: string
  updatedBy?: string | null
  createdAt: string
}

export type SourceSessionState = 'cold' | 'warm' | 'healthy' | 'degraded' | 'blocked'

export type SourceSessionAcquireStrategy = 'auto_browser_like' | 'auto_api_like' | 'manual_fallback'

export type SourceSessionProfile = {
  sourceId: string
  sessionState: SourceSessionState
  acquireStrategy: SourceSessionAcquireStrategy
  sessionKey: string | null
  ttlSeconds: number
  failStreak: number
  cooldownUntil: string | null
  qualityScore: number
  challengeHits: number
  emptyContentHits: number
  successCount: number
  failureCount: number
  lastValidatedAt: string | null
  lastRecoveryAction: string | null
  recoveryCount: number
  recoveryLastAt: string | null
  fingerprint: string | null
  updatedAt: string
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
  preferredProbeInput?: string | null
  rawProbeScore?: number | null
  jinaProbeScore?: number | null
  trafilaturaProbeScore?: number | null
  aiReadabilityGain?: number | null
  trafilaturaReadabilityGain?: number | null
  recommendedContentExtractor?: string | null
  contentCandidateSummaries: string[]
  jinaSearchUsed: boolean
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
  jinaUsed: boolean
  respondWith?: string | null
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
    return await $get<ClientRoutingAnalytics>('/analytics/client-routing', {
      silent: true,
    } satisfies ApiFetchOptions)
  },
  getAgentRouterStats: async () => {
    return await $get<AgentRouterStats>('/agent/router-stats', {
      silent: true,
    } satisfies ApiFetchOptions)
  },
  getAgentRouterConfig: async () => {
    return await $get<AgentRouterConfigSnapshot>('/agent/config', {
      silent: true,
    } satisfies ApiFetchOptions)
  },
  updateAgentRouterConfig: async (patch: AgentRouterConfigPatch) => {
    return await $patch<{
      success: boolean
      updatedAt: string
      updatedBy?: string | null
      config: AgentRouterConfigSnapshot['config']
    }>('/agent/config', patch, {
      silent: true,
    } satisfies ApiFetchOptions)
  },
  resetAgentRouterConfig: async () => {
    return await $delete<{
      success: boolean
      cleared: boolean
      config: AgentRouterConfigSnapshot['config']
    }>('/agent/config', {
      silent: true,
    } satisfies ApiFetchOptions)
  },
  getAgentRouterConfigAudit: async (limit = 20, cursor?: string | null) => {
    const params = new URLSearchParams()
    params.set('limit', String(Math.max(1, Math.min(100, limit))))
    if (cursor) {
      params.set('cursor', cursor)
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
    return await $get<SourcePackageSummary[]>('/source-packages', {
      silent: true,
    } satisfies ApiFetchOptions)
  },
  getSourcePackage: async (sourceId: string) => {
    return await $get<NxsSourcePackageDetail>(`/source-packages/${encodeURIComponent(sourceId)}`, {
      silent: true,
    } satisfies ApiFetchOptions)
  },
  /** Full `SourceRulePackage` import (builder/metadata). For plain NXS rules use `sourceApi.addSource`. */
  importSourcePackage: async (packageJson: string) => {
    return await $post<ImportSourcePackageResponse>(
      '/source-packages/import',
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
      '/source-builder/build-from-samples',
      payload,
      {
        silent: true,
      } satisfies ApiFetchOptions
    )
  },
  validateSourcePackage: async (packageDetail: unknown, samples?: SourceDebugPresetInputs) => {
    return await $post<ValidateSourcePackageResponse>(
      '/source-builder/validate',
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
    return await $post<SourceRuleRefineResponse>('/source-builder/refine', payload, {
      silent: true,
    } satisfies ApiFetchOptions)
  },
  runEngineByPackage: async (payload: {
    package: unknown
    operation: 'search' | 'book_info' | 'chapters' | 'content'
    query?: string
    targetUrl?: string
  }) => {
    return await $post<RunByPackageResponse>('/engine/run-by-package', payload, {
      silent: true,
    } satisfies ApiFetchOptions)
  },
  sourceFlowAssist: async (payload: {
    query: string
    sourceId?: string
    blockers?: string[]
    context?: string
  }) => {
    return await $post<SourceFlowAssistResponse>('/source/flow-assist', payload, {
      silent: true,
    } satisfies ApiFetchOptions)
  },
  sourceFlowAssistFeedback: async (payload: SourceFlowAssistFeedbackRequest) => {
    return await $post<{ success: boolean }>('/source/flow-assist/feedback', payload, {
      silent: true,
    } satisfies ApiFetchOptions)
  },
  getSourceFlowAssistFeedbackStats: async (params?: { sourceId?: string; days?: number }) => {
    const query = new URLSearchParams()
    if (params?.sourceId) {
      query.set('sourceId', params.sourceId)
    }
    if (params?.days != null) {
      query.set('days', String(params.days))
    }
    const suffix = query.size > 0 ? `?${query.toString()}` : ''
    return await $get<SourceFlowAssistFeedbackStatsResponse>(`/source/flow-assist/stats${suffix}`, {
      silent: true,
    } satisfies ApiFetchOptions)
  },
  getSourceFlowAssistProfile: async (sourceId: string) => {
    const query = new URLSearchParams({ sourceId })
    return await $get<{ success: boolean; profile: SourceFlowAssistProfile }>(
      `/source/flow-assist/profile?${query.toString()}`,
      {
        silent: true,
      } satisfies ApiFetchOptions
    )
  },
  saveSourceFlowAssistProfile: async (payload: {
    sourceId: string
    lifecycleState?: SourceFlowLifecycleState
    preferredActions?: SourceFlowAssistSuggestion['actionCode'][]
    conservativeMode?: boolean
    lastGoodRunId?: string | null
    recentFailureCodes?: string[]
  }) => {
    return await $post<{ success: boolean }>('/source/flow-assist/profile', payload, {
      silent: true,
    } satisfies ApiFetchOptions)
  },
  resetSourceFlowAssistProfile: async (payload: {
    sourceId: string
    lifecycleState?: 'new' | 'warming'
    clearPreferredActions?: boolean
  }) => {
    return await $post<{ success: boolean }>('/source/flow-assist/profile/reset', payload, {
      silent: true,
    } satisfies ApiFetchOptions)
  },
  getSourceFlowAssistProfileAudit: async (params: { sourceId: string; limit?: number }) => {
    const query = new URLSearchParams({ sourceId: params.sourceId })
    if (params.limit != null) {
      query.set('limit', String(params.limit))
    }
    return await $get<{ success: boolean; entries: SourceFlowAssistProfileAuditEntry[] }>(
      `/source/flow-assist/profile/audit?${query.toString()}`,
      {
        silent: true,
      } satisfies ApiFetchOptions
    )
  },
  autoAcquireFetchSession: async (payload: {
    sourceId: string
    acquireStrategy?: SourceSessionAcquireStrategy
    ttlSeconds?: number
    userAgent?: string
    headers?: Record<string, string>
    cookies?: Record<string, string>
  }) => {
    return await $post<{
      success: boolean
      profile: SourceSessionProfile
      sessionKey: string
      degraded: boolean
      degradedReason?: string
      sessionQualityScore: number
    }>('/fetch/session/auto-acquire', payload, {
      silent: true,
    } satisfies ApiFetchOptions)
  },
  verifyFetchSession: async (payload: {
    sourceId: string
    probeUrl?: string
    method?: string
    headers?: Record<string, string>
    timeoutMs?: number
    expectedMinBodyLength?: number
  }) => {
    return await $post<{
      success: boolean
      verified: boolean
      statusCode: number | null
      challengeDetected: boolean
      emptyContent: boolean
      degraded: boolean
      degradedReason?: string
      sessionQualityScore: number
      profile: SourceSessionProfile
    }>('/fetch/session/verify', payload, {
      silent: true,
    } satisfies ApiFetchOptions)
  },
  getSourceSessionProfile: async (sourceId: string) => {
    const query = new URLSearchParams({ sourceId })
    return await $get<{ success: boolean; profile: SourceSessionProfile }>(
      `/source-session/profile?${query.toString()}`,
      {
        silent: true,
      } satisfies ApiFetchOptions
    )
  },
  recoverSourceSessionProfile: async (payload: { sourceId: string; action?: string }) => {
    return await $post<{ success: boolean; profile: SourceSessionProfile }>(
      '/source-session/profile/recover',
      payload,
      {
        silent: true,
      } satisfies ApiFetchOptions
    )
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
    fetchMode?: string
    fetchProvider?: string
    fetchServiceUrl?: string
    fetchEngine?: string
  }) => {
    return await $post<FetchHtmlResponse>('/fetch/html', payload, {
      silent: true,
    } satisfies ApiFetchOptions)
  },
}
