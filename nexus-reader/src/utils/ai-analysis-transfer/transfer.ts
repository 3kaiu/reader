import type { AiMappingRule } from '@/types/ai-analysis'
import type { AiMappingTransferRule } from './types'

export function toAiMappingTransferRule(
  rule: AiMappingRule,
): AiMappingTransferRule {
  return {
    id: rule.id,
    original: rule.original,
    target: rule.target,
    type: rule.type,
    confidence: rule.confidence,
    enabled: rule.enabled,
  }
}
