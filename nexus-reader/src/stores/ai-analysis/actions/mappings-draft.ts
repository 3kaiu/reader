import type { AiMappingRule } from '@/types/ai-analysis'
import {
  buildAiMappingRuleFromDraft,
  createAiMappingDraft,
  type AiMappingDraft,
} from '@/utils/aiAnalysisTransfer'
import type { ApiResponse } from '@/api/http/types'
import type { SaveAiMappingDraftResult } from '../types'

interface AiAnalysisMappingsDraftDeps {
  saveMapping: (rule: AiMappingRule) => Promise<ApiResponse<void>>
}

export function createAiAnalysisMappingsDraftActions(
  deps: AiAnalysisMappingsDraftDeps,
) {
  function createMappingDraft(rule?: Partial<AiMappingRule> | null): AiMappingDraft {
    return createAiMappingDraft(rule)
  }

  async function saveMappingDraft(
    draft: Partial<AiMappingDraft>,
    existingRule?: AiMappingRule | null,
  ): Promise<SaveAiMappingDraftResult> {
    const rule = buildAiMappingRuleFromDraft(draft, existingRule)
    if (!rule) {
      return {
        status: 'invalid',
        errorMsg: '请填写完整信息',
      }
    }

    const response = await deps.saveMapping(rule)
    if (!response.isSuccess) {
      return {
        status: 'failed',
        rule,
        errorMsg: response.errorMsg || '保存失败',
      }
    }

    return {
      status: 'saved',
      rule,
    }
  }

  return {
    createMappingDraft,
    saveMappingDraft,
  }
}
