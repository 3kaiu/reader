import type { ApiResponse } from '@/api/http/types'
import type { AiMappingRule } from '@/types/ai-analysis'

export interface AiAnalysisMappingsHelpers {
  loadMappings: (force?: boolean) => Promise<ApiResponse<AiMappingRule[]>>
}
