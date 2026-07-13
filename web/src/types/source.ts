export type SourceLicenseStatus =
  'unknown' | 'licensed' | 'public_domain' | 'restricted' | 'blocked'

export type SourceAccessMode = 'unknown' | 'api' | 'feed' | 'public_archive' | 'manual_import'

export interface SourcePolicy {
  licenseStatus?: SourceLicenseStatus
  accessMode?: SourceAccessMode
  lastVerifiedAt?: number
  notes?: string
}

export interface SourceHealthSummary {
  sourceId: string
  successCount: number
  failureCount: number
  avgLatencyMs: number
  score: number
  healthPoints?: number
  consecutiveSuccesses?: number
  consecutiveFailures?: number
  circuitState?: string
  primaryFailure?: string
  fallbackHitRate?: number
  avgQualityScore?: number
  strategyChain?: string[]
  restoredFromSnapshot?: boolean
  snapshotUpdatedAtMs?: number
  healthEventsSinceSnapshot?: number
  extractionEventsSinceSnapshot?: number
  lowConfidence?: boolean
}

export interface SourceRuntimeProfile {
  strategyChain: string[]
  timeoutMs: number
  retryBudget: number
  concurrencyLimit: number
}

export interface SourceRuntimeProfileResponse {
  sourceId: string
  profile: SourceRuntimeProfile
}

export interface SourceCircuitStateResponse {
  sourceId: string
  state: string
}

export interface SourceRuntimeResetResponse {
  sourceId: string
  reset: boolean
  mode: string
}

export interface RuntimeSnapshotSaveResponse {
  saved: boolean
  updatedAtMs: number
  healthSources: number
  extractionSources: number
}

export interface RuntimeSnapshotExportResponse {
  exportedAtMs: number
  restoredFromSnapshot: boolean
  snapshotUpdatedAtMs?: number
  healthSources: number
  extractionSources: number
  health: unknown[]
  extraction: unknown[]
}

export interface RuntimeSnapshotImportResponse {
  imported: boolean
  importedAtMs: number
  healthSources: number
  extractionSources: number
}

export interface RuntimeStateOverviewResponse {
  restoredFromSnapshot: boolean
  snapshotUpdatedAtMs?: number
  trackedSources: number
  unhealthySources: number
  openCircuitSources: number
  lowConfidenceSources: number
  healthEventsSinceSnapshot: number
  extractionEventsSinceSnapshot: number
}

export interface BookSource {
  id: string
  name: string
  url?: string
  enabled: boolean
  policy?: SourcePolicy
  health?: SourceHealthSummary
  publicAccessEnabled?: boolean
  version?: number | string
  origin?: string
  originName?: string
  bookUrl?: string
  coverUrl?: string
  latestChapterTitle?: string
  time?: number
  type?: string
  bookSourceGroup?: string
}
