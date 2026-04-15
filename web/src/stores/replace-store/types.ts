import type { ComputedRef, Ref } from 'vue'
import type { ApiResponse } from '@/api/http/types'
import type { ReplaceRule } from '@/types/replace'
import type { ReplaceRuleDraft } from '@/utils/replaceRules'

export type ImportReplaceRulesResult = {
  status: 'imported' | 'partial' | 'failed'
  rules: ReplaceRule[]
  savedCount: number
  skippedCount: number
  normalizedText?: string
  errorMsg?: string
}

export type SaveReplaceRuleDraftResult = {
  status: 'saved' | 'invalid' | 'failed'
  rule?: ReplaceRule
  errorMsg?: string
}

export type DeleteReplaceRulesResult = {
  status: 'deleted' | 'partial' | 'failed'
  deletedCount: number
  failedCount: number
  deletedKeys: string[]
  remainingKeys: string[]
  errorMsg?: string
}

export interface ReplaceStoreState {
  rules: Ref<ReplaceRule[]>
  loading: Ref<boolean>
  loaded: Ref<boolean>
}

export interface ReplaceStoreView {
  enabledCount: ComputedRef<number>
}

export interface ReplaceStoreActions {
  loadRules(force?: boolean): Promise<ApiResponse<ReplaceRule[]>>
  filterRules(keyword?: string): ReplaceRule[]
  getRulesByKeys(keys: Iterable<string>): ReplaceRule[]
  getExportRules(keys?: Iterable<string>, fallback?: ReplaceRule[]): ReplaceRule[]
  createRuleDraft(rule?: Partial<ReplaceRule> | null): ReplaceRuleDraft
  saveRule(rule: ReplaceRule): Promise<ApiResponse<ReplaceRule>>
  saveRuleDraft(draft: Partial<ReplaceRuleDraft>): Promise<SaveReplaceRuleDraftResult>
  saveRules(batch: ReplaceRule[]): Promise<ApiResponse<ReplaceRule[]>>
  importRulesFromText(text: string): Promise<ImportReplaceRulesResult>
  deleteRulesByKeys(keys: Iterable<string>): Promise<DeleteReplaceRulesResult>
  setRuleEnabled(rule: ReplaceRule, enabled: boolean): Promise<ApiResponse<ReplaceRule>>
}
