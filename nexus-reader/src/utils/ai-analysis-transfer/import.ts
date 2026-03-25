import type { AiMappingRule } from '@/types/ai-analysis'
import {
  createAiMappingId,
} from './id'
import {
  normalizeAiMappingConfidence,
  normalizeAiMappingText,
  normalizeAiMappingType,
} from './normalize'
import type {
  AiMappingTransferRule,
  ParsedAiMappingImport,
} from './types'

export function normalizeImportedAiMappingRule(
  value: unknown,
): AiMappingRule | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const raw = value as Partial<AiMappingTransferRule> &
    Partial<Pick<AiMappingRule, 'createdAt' | 'usageCount'>>
  const original = normalizeAiMappingText(raw.original)
  const target = normalizeAiMappingText(raw.target)

  if (!original || !target) {
    return null
  }

  return {
    id: createAiMappingId(raw.id),
    original,
    target,
    type: normalizeAiMappingType(raw.type),
    confidence: normalizeAiMappingConfidence(raw.confidence),
    enabled: raw.enabled !== false,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    usageCount:
      typeof raw.usageCount === 'number' ? raw.usageCount : undefined,
  }
}

export function parseImportedAiMappingRules(
  value: unknown,
): AiMappingRule[] | null {
  const list = Array.isArray(value)
    ? value
    : value &&
        typeof value === 'object' &&
        Array.isArray((value as { mappings?: unknown[] }).mappings)
      ? (value as { mappings: unknown[] }).mappings
      : null

  if (!list) {
    return null
  }

  return list
    .map(item => normalizeImportedAiMappingRule(item))
    .filter((item): item is AiMappingRule => item !== null)
}

export function parseImportedAiMappingText(text: string): ParsedAiMappingImport {
  const trimmed = text.trim()
  if (!trimmed) {
    return {
      success: false,
      rules: [],
      totalCount: 0,
      skippedCount: 0,
      error: '文件内容为空',
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return {
      success: false,
      rules: [],
      totalCount: 0,
      skippedCount: 0,
      error: '文件格式不正确',
    }
  }

  const rules = parseImportedAiMappingRules(parsed)
  if (!rules) {
    return {
      success: false,
      rules: [],
      totalCount: 0,
      skippedCount: 0,
      error: '文件格式不正确',
    }
  }

  const totalCount =
    Array.isArray(parsed)
      ? parsed.length
      : Array.isArray((parsed as { mappings?: unknown[] })?.mappings)
        ? (parsed as { mappings: unknown[] }).mappings.length
        : rules.length

  return {
    success: true,
    rules,
    totalCount,
    skippedCount: totalCount - rules.length,
  }
}
