import { aiApi } from '@/api/ai'
import { getImportBatchStatus } from '@/utils/batchMutation'
import { parseImportedAiMappingText } from '@/utils/aiAnalysisTransfer'
import type { AiMappingRule } from '@/types/ai-analysis'
import type { ImportAiMappingsResult } from '../types'
import type { AiAnalysisMappingsHelpers } from './mappings-shared'

export function createAiAnalysisMappingsImportActions(
  helpers: AiAnalysisMappingsHelpers,
) {
  async function importMappings(rules: AiMappingRule[]): Promise<ImportAiMappingsResult> {
    if (rules.length === 0) {
      return {
        status: 'failed',
        importedCount: 0,
        totalCount: 0,
        skippedCount: 0,
        errorMsg: '未找到有效的映射规则',
      }
    }

    let importedCount = 0
    let lastError: string | undefined

    for (const rule of rules) {
      const response = await aiApi.saveMapping(rule)
      if (!response.isSuccess) {
        lastError = response.errorMsg || `保存映射规则失败: ${rule.original}`
        continue
      }

      importedCount += 1
    }

    if (importedCount > 0) {
      await helpers.loadMappings(true)
    }

    return {
      status: getImportBatchStatus(importedCount, rules.length),
      importedCount,
      totalCount: rules.length,
      skippedCount: 0,
      errorMsg: lastError,
    }
  }

  async function importMappingsFromText(text: string): Promise<ImportAiMappingsResult> {
    const parsed = parseImportedAiMappingText(text)
    if (!parsed.success) {
      return {
        status: 'failed',
        importedCount: 0,
        totalCount: 0,
        skippedCount: 0,
        errorMsg: parsed.error || '导入失败',
      }
    }

    if (parsed.rules.length === 0) {
      return {
        status: 'failed',
        importedCount: 0,
        totalCount: parsed.totalCount,
        skippedCount: parsed.skippedCount,
        errorMsg: '未找到有效的映射规则',
      }
    }

    const result = await importMappings(parsed.rules)

    return {
      ...result,
      status: getImportBatchStatus(result.importedCount, parsed.totalCount),
      totalCount: parsed.totalCount,
      skippedCount: parsed.skippedCount + (parsed.rules.length - result.importedCount),
    }
  }

  return {
    importMappings,
    importMappingsFromText,
  }
}
