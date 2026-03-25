import type { ComputedRef, Ref } from 'vue'
import type { ApiResponse } from '@/api/http/types'
import type { AiAnalysisHistory, AiMappingRule } from '@/types/ai-analysis'
import type { AiMappingFilterType } from '@/utils/aiAnalysisStore'
import type {
  AiMappingDraft,
  AiMappingTransferRule,
} from '@/utils/aiAnalysisTransfer'

export type HydrateResult = {
  mappings: ApiResponse<AiMappingRule[]>
  history: ApiResponse<AiAnalysisHistory[]>
}

export type ImportAiMappingsResult = {
  status: 'imported' | 'partial' | 'failed'
  importedCount: number
  totalCount: number
  skippedCount: number
  errorMsg?: string
}

export type SaveAiMappingDraftResult = {
  status: 'saved' | 'invalid' | 'failed'
  rule?: AiMappingRule
  errorMsg?: string
}

export interface AiAnalysisStoreState {
  mappings: Ref<AiMappingRule[]>
  history: Ref<AiAnalysisHistory[]>
  loading: Ref<boolean>
  mappingsLoaded: Ref<boolean>
  historyLoaded: Ref<boolean>
  searchKeyword: Ref<string>
  filterType: Ref<AiMappingFilterType>
}

export interface AiAnalysisStoreView {
  displayMappings: ComputedRef<AiMappingRule[]>
  stats: ComputedRef<ReturnType<typeof import('@/utils/aiAnalysisStore').getAiMappingStats>>
}

export interface AiAnalysisStoreActions {
  loadMappings(force?: boolean): Promise<ApiResponse<AiMappingRule[]>>
  loadHistory(force?: boolean, limit?: number): Promise<ApiResponse<AiAnalysisHistory[]>>
  hydrate(force?: boolean): Promise<HydrateResult>
  createMappingDraft(rule?: Partial<AiMappingRule> | null): AiMappingDraft
  saveMapping(rule: AiMappingRule): Promise<ApiResponse<void>>
  saveMappingDraft(
    draft: Partial<AiMappingDraft>,
    existingRule?: AiMappingRule | null
  ): Promise<SaveAiMappingDraftResult>
  deleteMapping(id: string): Promise<ApiResponse<void>>
  setMappingEnabled(rule: AiMappingRule, enabled: boolean): Promise<ApiResponse<void>>
  exportMappings(): AiMappingTransferRule[]
  importMappings(rules: AiMappingRule[]): Promise<ImportAiMappingsResult>
  importMappingsFromText(text: string): Promise<ImportAiMappingsResult>
  clearHistory(): Promise<ApiResponse<void>>
  resetFilters(): void
}
