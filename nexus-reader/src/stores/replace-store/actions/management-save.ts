import { replaceApi } from '@/api/replace'
import type { ApiResponse } from '@/api/http/types'
import type { ReplaceRule } from '@/types/replace'
import { upsertRuleList } from '@/utils/replaceStore'
import type { ReplaceManagementHelpers } from './management-shared'

export function createReplaceManagementSaveActions(helpers: ReplaceManagementHelpers) {
  async function saveRule(rule: ReplaceRule): Promise<ApiResponse<ReplaceRule>> {
    const response = await replaceApi.saveReplaceRule(rule)
    if (response.isSuccess && response.data) {
      helpers.setRules(upsertRuleList(helpers.rules(), [response.data]))
    }
    return response
  }

  async function saveRules(batch: ReplaceRule[]): Promise<ApiResponse<ReplaceRule[]>> {
    const response = await replaceApi.saveReplaceRules(batch)
    if ((response.data || []).length > 0) {
      helpers.setRules(upsertRuleList(helpers.rules(), response.data || []))
    }
    return response
  }

  return {
    saveRule,
    saveRules,
  }
}
