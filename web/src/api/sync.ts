import { $delete, $get, $post, type ApiFetchOptions } from './client'

export type SourcePackageSummary = {
  sourceId: string
  sourceName: string
  host: string
  packageId: string
  generatedAtMs: number
  enabled: boolean
  valid: boolean
  readinessState:
    'draft' | 'blocked' | 'search_ready' | 'catalog_ready' | 'reading_ready' | 'full_flow_ready'
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

type SourceReadinessReport = {
  state:
    'draft' | 'blocked' | 'search_ready' | 'catalog_ready' | 'reading_ready' | 'full_flow_ready'
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

type SourceHealthReport = {
  overallScore: number
  recommended: boolean
  search: SourceHealthSegment
  book: SourceHealthSegment
  toc: SourceHealthSegment
  content: SourceHealthSegment
}

type SourceDocumentation = {
  siteSummary?: string
  pageModel?: string
  bookPageNotes?: string
  chapterPageNotes?: string
  contentNoiseNotes?: string[]
  knownRisks?: string[]
  recommendedUsage?: string
}

type SourceBuildSamples = {
  bookSampleUrl?: string
  chapterSampleUrl?: string
  bookSampleFingerprint?: string
  chapterSampleFingerprint?: string
}

type SourceCapabilityMatrix = {
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

type SourceSearchMode = 'native_search' | 'direct_detail' | 'external_discovery'

type SearchPaginationRule = {
  enabled: boolean
  nextPageSelector?: string | null
  maxPages: number
}

type SearchStrategyRule = {
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

type SourceSearchProfile = {
  enabled: boolean
  defaultMode?: SourceSearchMode | null
  strategies: SearchStrategyRule[]
}

type SourceImportPolicy = {
  enabledByDefault: boolean
  priority: number
  allowSearch: boolean
  allowRead: boolean
  visibility: string
}

type SourceFetchProfile = {
  mode: string
  provider: string
  serviceUrl?: string | null
  engine?: string | null
  sessionKey?: string | null
  note?: string | null
}

type SourceRuleValidationReport = {
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

type SourceValidationStepReport = {
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

type ImportSourcePackageResponse = {
  sourceId: string
  packageId: string
  imported: boolean
  compileReady: boolean
  importable: boolean
  readinessState:
    'draft' | 'blocked' | 'search_ready' | 'catalog_ready' | 'reading_ready' | 'full_flow_ready'
}

export const syncApi = {
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
}
