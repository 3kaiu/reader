import type { AiMappingRule } from '@/types/ai-analysis'

export type AiMappingTransferRule = Pick<
  AiMappingRule,
  'id' | 'original' | 'target' | 'type' | 'confidence' | 'enabled'
>

export type AiMappingDraft = {
  original: string
  target: string
  type: string
  confidence: number
  enabled: boolean
}

export type ParsedAiMappingImport = {
  success: boolean
  rules: AiMappingRule[]
  totalCount: number
  skippedCount: number
  error?: string
}

export function normalizeAiMappingText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeAiMappingConfidence(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0.8
  }

  return Math.min(1, Math.max(0, value))
}

export function normalizeAiMappingType(value: unknown): string {
  const type = normalizeAiMappingText(value)
  return type || 'person'
}

export function createAiMappingDraft(
  rule?: Partial<AiMappingRule> | null
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
  now = Date.now()
): AiMappingRule | null {
  const original = normalizeAiMappingText(draft?.original)
  const target = normalizeAiMappingText(draft?.target)

  if (!original || !target) {
    return null
  }

  return {
    id:
      normalizeAiMappingText(existingRule?.id) ||
      `mapping_${now}_${crypto.randomUUID()}`,
    original,
    target,
    type: normalizeAiMappingType(draft?.type),
    confidence: normalizeAiMappingConfidence(draft?.confidence),
    enabled: draft?.enabled !== false,
    createdAt: existingRule?.createdAt || now,
    usageCount: existingRule?.usageCount || 0,
  }
}

export function toAiMappingTransferRule(
  rule: AiMappingRule
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

export function normalizeImportedAiMappingRule(
  value: unknown
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
    id:
      normalizeAiMappingText(raw.id) ||
      `mapping_${Date.now()}_${crypto.randomUUID()}`,
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
  value: unknown
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
