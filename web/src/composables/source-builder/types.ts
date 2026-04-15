import type {
  FetchHtmlResponse,
  NxsSourcePackageDetail,
  SourceBuildDiagnostics,
  SourceFetchDebugInfo,
  SourceValidationStepReport,
} from '@/api/sync'

export type SourceBuilderDebugSnapshot = {
  id: string
  kind: 'build' | 'validate' | 'refine' | 'fetch_html' | 'session_import'
  createdAtMs: number
  title: string
  sourceLabel?: string
  sessionKey?: string
  bookCurl?: string
  chapterCurl?: string
  searchCurl?: string
  searchKeyword?: string
  packageData?: NxsSourcePackageDetail | null
  packageJson?: string
  diagnostics?: SourceBuildDiagnostics | null
  validationReport?: unknown
  fetchDebug?: SourceFetchDebugInfo | null
  fetchHtmlPreview?: FetchHtmlResponse | null
}

export type SearchRunResultItem = {
  name?: string
  bookUrl?: string
  sourceName?: string
  author?: string
}

export type ChapterRunResultItem = {
  title?: string
  url?: string
}

export type RunByPackageResult = {
  packageId: string
  operation: string
  result: unknown
  step?: SourceValidationStepReport | null
  fetchDebug?: SourceFetchDebugInfo | null
}

export type RefineSuggestion = {
  id: string
  step: string
  title: string
  detail: string
  kind: 'structured' | 'free_text' | 'fetch'
  applyLabel: string
  apply: () => void
}
