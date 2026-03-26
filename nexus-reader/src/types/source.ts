export type SourceLicenseStatus =
  | 'unknown'
  | 'licensed'
  | 'public_domain'
  | 'restricted'
  | 'blocked'

export type SourceAccessMode =
  | 'unknown'
  | 'api'
  | 'feed'
  | 'public_archive'
  | 'manual_import'

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
