import type { ApiResponse } from '@/api/http/types'
import { aiApi } from '@/api/ai'
import type { AiMappingRule } from '@/types/ai-analysis'
import type { AiAnalysisMappingsHelpers } from './mappings-shared'

interface AiAnalysisMappingsDeleteDeps {
  helpers: AiAnalysisMappingsHelpers
  saveMapping: (rule: AiMappingRule) => Promise<ApiResponse<void>>
}

export function createAiAnalysisMappingsDeleteActions(
  deps: AiAnalysisMappingsDeleteDeps,
) {
  async function deleteMapping(id: string): Promise<ApiResponse<void>> {
    const response = await aiApi.deleteMapping(id)
    if (response.isSuccess) {
      await deps.helpers.loadMappings(true)
    }
    return response
  }

  async function setMappingEnabled(
    rule: AiMappingRule,
    enabled: boolean,
  ): Promise<ApiResponse<void>> {
    return deps.saveMapping({
      ...rule,
      enabled,
    })
  }

  return {
    deleteMapping,
    setMappingEnabled,
  }
}
