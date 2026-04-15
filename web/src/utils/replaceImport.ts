import type { ReplaceRule } from '@/types/replace'

export type ParsedReplaceRuleImport = {
  success: boolean
  rules: ReplaceRule[]
  skippedCount: number
  error?: string
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function isRuleLike(value: unknown): value is Partial<ReplaceRule> {
  return Boolean(value && typeof value === 'object')
}

export function normalizeReplaceRule(rule: Partial<ReplaceRule>): ReplaceRule | null {
  const name = typeof rule.name === 'string' ? rule.name.trim() : ''
  const pattern = typeof rule.pattern === 'string' ? rule.pattern.trim() : ''

  if (!name || !pattern) {
    return null
  }

  return {
    id: typeof rule.id === 'string' ? rule.id : undefined,
    name,
    pattern,
    replacement: normalizeOptionalText(rule.replacement),
    scope: normalizeOptionalText(rule.scope),
    isEnabled: rule.isEnabled !== false,
    isRegex: Boolean(rule.isRegex),
  }
}

export function parseReplaceRuleImport(text: string): ParsedReplaceRuleImport {
  const trimmed = text.trim()
  if (!trimmed) {
    return {
      success: false,
      rules: [],
      skippedCount: 0,
      error: '请输入内容',
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return {
      success: false,
      rules: [],
      skippedCount: 0,
      error: 'JSON 格式错误',
    }
  }

  const list = Array.isArray(parsed) ? parsed : [parsed]
  const rules = list
    .map(item => normalizeReplaceRule(isRuleLike(item) ? item : {}))
    .filter((rule): rule is ReplaceRule => rule !== null)

  if (rules.length === 0) {
    return {
      success: false,
      rules: [],
      skippedCount: list.length,
      error: '未找到符合契约的规则，至少需要 name 和 pattern',
    }
  }

  return {
    success: true,
    rules,
    skippedCount: list.length - rules.length,
  }
}
