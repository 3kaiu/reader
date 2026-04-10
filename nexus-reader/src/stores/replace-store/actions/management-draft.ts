import type { ReplaceRule } from '@/types/replace'
import {
  buildReplaceRuleFromDraft,
  createReplaceRuleDraft,
  type ReplaceRuleDraft,
} from '@/utils/replaceRules'
import type { ApiResponse } from '@/api/http/types'
import type { SaveReplaceRuleDraftResult } from '../types'

interface ReplaceManagementDraftActionsDeps {
  saveRule: (rule: ReplaceRule) => Promise<ApiResponse<ReplaceRule>>
}

export function createReplaceManagementDraftActions(deps: ReplaceManagementDraftActionsDeps) {
  function createRuleDraft(rule?: Partial<ReplaceRule> | null): ReplaceRuleDraft {
    return createReplaceRuleDraft(rule)
  }

  async function saveRuleDraft(
    draft: Partial<ReplaceRuleDraft>
  ): Promise<SaveReplaceRuleDraftResult> {
    const rule = buildReplaceRuleFromDraft(draft)
    if (!rule) {
      return {
        status: 'invalid',
        errorMsg: !String(draft.name || '').trim() ? '请输入规则名称' : '请输入替换规则',
      }
    }

    const response = await deps.saveRule(rule)
    if (!response.isSuccess) {
      return {
        status: 'failed',
        rule,
        errorMsg: response.errorMsg || '保存失败',
      }
    }

    return {
      status: 'saved',
      rule: response.data || rule,
    }
  }

  return {
    createRuleDraft,
    saveRuleDraft,
  }
}
