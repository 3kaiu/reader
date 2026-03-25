import type { AiMappingRule } from '@/types/ai-analysis'
import {
  createAiMappingId,
  resolveAiMappingCreatedAt,
} from './id'
import {
  normalizeAiMappingConfidence,
  normalizeAiMappingText,
  normalizeAiMappingType,
} from './normalize'
import type { AiMappingDraft } from './types'

export function createAiMappingDraft(
  rule?: Partial<AiMappingRule> | null,
): AiMappingDraft {
  return {
    original: normalizeAiMappingText(rule?.original),
    target: normalizeAiMappingText(rule?.target),
    type: normalizeAiMappingType(rule?.type),
    confidence: normalizeAiMappingConfidence(rule?.confidence),
    enabled: rule?.enabled !== false,
  }
}

export function buildAiMappingRuleFromDraft(
  draft: Partial<AiMappingDraft> | null | undefined,
  existingRule?: AiMappingRule | null,
  now = Date.now(),
): AiMappingRule | null {
  const original = normalizeAiMappingText(draft?.original)
  const target = normalizeAiMappingText(draft?.target)

  if (!original || !target) {
    return null
  }

  return {
    id: createAiMappingId(existingRule?.id, now),
    original,
    target,
    type: normalizeAiMappingType(draft?.type),
    confidence: normalizeAiMappingConfidence(draft?.confidence),
    enabled: draft?.enabled !== false,
    createdAt: resolveAiMappingCreatedAt(existingRule, now),
    usageCount: existingRule?.usageCount || 0,
  }
}
