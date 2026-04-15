import { getImportBatchStatus } from '@/utils/batchMutation'
import { parseReplaceRuleImport } from '@/utils/replaceImport'
import { toPrettyJson } from '@/utils/json'
import type { ReplaceRule } from '@/types/replace'
import type { ApiResponse } from '@/api/http/types'
import type { ImportReplaceRulesResult } from '../types'

interface ReplaceManagementImportActionsDeps {
  saveRules: (batch: ReplaceRule[]) => Promise<ApiResponse<ReplaceRule[]>>
}

export function createReplaceManagementImportActions(deps: ReplaceManagementImportActionsDeps) {
  async function importRulesFromText(text: string): Promise<ImportReplaceRulesResult> {
    const parsed = parseReplaceRuleImport(text)
    if (!parsed.success) {
      return {
        status: 'failed',
        rules: [],
        savedCount: 0,
        skippedCount: parsed.skippedCount,
        errorMsg: parsed.error || '导入失败',
      }
    }

    const response = await deps.saveRules(parsed.rules)
    const savedCount = (response.data || []).length

    return {
      status: getImportBatchStatus(savedCount, parsed.rules.length),
      rules: parsed.rules,
      savedCount,
      skippedCount: parsed.skippedCount,
      normalizedText: toPrettyJson(parsed.rules),
      errorMsg: response.isSuccess
        ? undefined
        : response.errorMsg || (savedCount > 0 ? '部分规则导入失败' : '导入失败'),
    }
  }

  return {
    importRulesFromText,
  }
}
