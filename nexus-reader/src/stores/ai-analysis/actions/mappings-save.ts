import type { ApiResponse } from '@/api/http/types'
import { aiApi } from '@/api/ai'
import type { AiMappingRule } from '@/types/ai-analysis'
import type { AiAnalysisMappingsHelpers } from './mappings-shared'

export function createAiAnalysisMappingsSaveActions(
  helpers: AiAnalysisMappingsHelpers,
) {
  async function saveMapping(rule: AiMappingRule): Promise<ApiResponse<void>> {
    const response = await aiApi.saveMapping(rule)
    if (response.isSuccess) {
      await helpers.loadMappings(true)
    }
    return response
  }

  return {
    saveMapping,
  }
}
