import type { ComputedRef, Ref } from 'vue'
import type { ApiResponse } from '@/api/http/types'
import type { BookSource, SourcePolicy } from '@/types/source'
import type {
  SourceDefinition,
  SourceListEntry,
} from '@/utils/sourceStore'

export type SourceListItem = SourceListEntry

export type ImportSourcesResult = {
  status: 'imported' | 'partial' | 'failed'
  successCount: number
  totalCount: number
  errorMsg?: string
}

export type ImportSourceTextResult = ImportSourcesResult & {
  normalizedText?: string
}

export type SourceDetailTextResult = {
  text: string
  isStale: boolean
  errorMsg?: string
}

export type DeleteSourcesResult = {
  status: 'deleted' | 'partial' | 'failed'
  deletedCount: number
  failedCount: number
  deletedIds: string[]
  remainingIds: string[]
  errorMsg?: string
}

export interface SourceStoreState {
  sources: Ref<SourceListItem[]>
  loading: Ref<boolean>
  loaded: Ref<boolean>
}

export interface SourceStoreView {
  enabledCount: ComputedRef<number>
  groups: ComputedRef<ReturnType<typeof import('@/utils/sourceStore').buildSourceGroups>>
}

export interface SourceStoreActions {
  loadSources(force?: boolean): Promise<ApiResponse<BookSource[]>>
  updateSourceStatus(id: string, enabled: boolean): Promise<ApiResponse<BookSource>>
  updateSourcePolicy(id: string, policy: SourcePolicy): Promise<ApiResponse<BookSource>>
  setSourceEnabled(id: string, enabled: boolean): Promise<ApiResponse<BookSource>>
  filterSources(keyword?: string): SourceListItem[]
  getSourcesByIds(ids: Iterable<string>): SourceListItem[]
  getExportSources(ids?: Iterable<string>, fallback?: SourceListItem[]): SourceListItem[]
  getSourceDetail(id: string): Promise<ApiResponse<BookSource>>
  getSourceDetailText(source: BookSource): Promise<SourceDetailTextResult>
  importSources(sourcesToImport: SourceDefinition[]): Promise<ImportSourcesResult>
  importSourceText(text: string): Promise<ImportSourceTextResult>
  deleteSourceIds(ids: Iterable<string>): Promise<DeleteSourcesResult>
}
