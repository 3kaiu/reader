import type { AiMappingRule } from '@/types/ai-analysis'
import { toAiMappingTransferRule } from '@/utils/aiAnalysisTransfer'

export function createAiAnalysisMappingsExportActions() {
  function exportMappings(mappings: AiMappingRule[]) {
    return mappings.map(toAiMappingTransferRule)
  }

  return {
    exportMappings,
  }
}
