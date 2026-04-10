import type { ReplaceRule } from '@/types/replace'

export type ReplaceRuleDraft = {
  id?: string
  name: string
  pattern: string
  replacement: string
  scope: string
  isEnabled: boolean
  isRegex: boolean
}

export function getReplaceRuleKey(rule: ReplaceRule): string {
  return rule.id || `${rule.name}::${rule.pattern}::${rule.scope || ''}`
}

function normalizeDraftText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function createReplaceRuleDraft(rule?: Partial<ReplaceRule> | null): ReplaceRuleDraft {
  return {
    id: typeof rule?.id === 'string' ? rule.id : undefined,
    name: normalizeDraftText(rule?.name),
    pattern: normalizeDraftText(rule?.pattern),
    replacement: typeof rule?.replacement === 'string' ? rule.replacement : '',
    scope: typeof rule?.scope === 'string' ? rule.scope : '',
    isEnabled: rule?.isEnabled !== false,
    isRegex: Boolean(rule?.isRegex),
  }
}

export function buildReplaceRuleFromDraft(
  draft: Partial<ReplaceRuleDraft> | null | undefined
): ReplaceRule | null {
  const name = normalizeDraftText(draft?.name)
  const pattern = normalizeDraftText(draft?.pattern)

  if (!name || !pattern) {
    return null
  }

  const replacement = typeof draft?.replacement === 'string' ? draft.replacement.trim() : ''
  const scope = typeof draft?.scope === 'string' ? draft.scope.trim() : ''

  return {
    id: typeof draft?.id === 'string' ? draft.id : undefined,
    name,
    pattern,
    replacement: replacement || null,
    scope: scope || null,
    isEnabled: draft?.isEnabled !== false,
    isRegex: Boolean(draft?.isRegex),
  }
}
