import { normalizeAiMappingText } from './normalize'
import type { AiMappingRule } from '@/types/ai-analysis'

export function createAiMappingId(
  existingId?: string | null,
  now = Date.now(),
): string {
  return normalizeAiMappingText(existingId) || `mapping_${now}_${crypto.randomUUID()}`
}

export function resolveAiMappingCreatedAt(
  existingRule?: AiMappingRule | null,
  now = Date.now(),
): number {
  return existingRule?.createdAt || now
}
