import { replaceApi } from '@/api/replace'
import type { ApiResponse } from '@/api/http/types'
import type { ReplaceRule } from '@/types/replace'
import { getReplaceRuleKey } from '@/utils/replaceRules'
import { upsertRuleList } from '@/utils/replaceStore'
import type { ReplaceManagementHelpers } from './management-shared'

export function createReplaceManagementToggleActions(helpers: ReplaceManagementHelpers) {
  async function setRuleEnabled(
    rule: ReplaceRule,
    enabled: boolean
  ): Promise<ApiResponse<ReplaceRule>> {
    const ruleKey = getReplaceRuleKey(rule)
    const previousRule = helpers.rules().find(item => getReplaceRuleKey(item) === ruleKey)
    const previousValue = previousRule?.isEnabled ?? rule.isEnabled

    helpers.setRules(
      helpers.rules().map(item =>
        getReplaceRuleKey(item) === ruleKey
          ? {
              ...item,
              isEnabled: enabled,
            }
          : item
      )
    )

    const response = await replaceApi.saveReplaceRule({
      ...rule,
      isEnabled: enabled,
    })

    if (response.isSuccess && response.data) {
      helpers.setRules(upsertRuleList(helpers.rules(), [response.data]))
      return response
    }

    helpers.setRules(
      helpers.rules().map(item =>
        getReplaceRuleKey(item) === ruleKey
          ? {
              ...item,
              isEnabled: previousValue,
            }
          : item
      )
    )

    return response
  }

  return {
    setRuleEnabled,
  }
}
