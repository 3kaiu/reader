import { replaceApi } from '@/api/replace'
import type { ApiResponse } from '@/api/http/types'
import type { ReplaceRule } from '@/types/replace'
import {
  buildDeleteBatchSummary,
  normalizeBatchIds,
} from '@/utils/batchMutation'
import { getReplaceRuleKey } from '@/utils/replaceRules'
import type {
  DeleteReplaceRulesResult,
} from '../types'
import type { ReplaceManagementHelpers } from './management-shared'

export function createReplaceManagementDeleteActions(
  helpers: ReplaceManagementHelpers,
) {
  async function deleteRules(targetRules: ReplaceRule[]): Promise<ApiResponse<ReplaceRule[]>> {
    const response = await replaceApi.deleteReplaceRules(targetRules)
    const deletedRules = response.data || []

    if (deletedRules.length > 0) {
      const deletedKeys = new Set(deletedRules.map(getReplaceRuleKey))
      helpers.setRules(
        helpers.rules().filter(rule => !deletedKeys.has(getReplaceRuleKey(rule))),
      )
    }

    return response
  }

  async function deleteRulesByKeys(
    keys: Iterable<string>,
  ): Promise<DeleteReplaceRulesResult> {
    const targetKeys = normalizeBatchIds(keys)
    const targetRules = helpers.getRulesByKeys(targetKeys)
    if (targetRules.length === 0) {
      return {
        status: 'deleted',
        deletedCount: 0,
        failedCount: 0,
        deletedKeys: [],
        remainingKeys: [],
      }
    }

    const response = await deleteRules(targetRules)
    const summary = buildDeleteBatchSummary(
      targetKeys,
      (response.data || []).map(getReplaceRuleKey),
      response.errorMsg,
    )

    return {
      status: summary.status,
      deletedCount: summary.deletedCount,
      failedCount: summary.failedCount,
      deletedKeys: summary.deletedIds,
      remainingKeys: summary.remainingIds,
      errorMsg: summary.errorMsg,
    }
  }

  return {
    deleteRulesByKeys,
  }
}
