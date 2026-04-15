import type { ReplaceRule } from '@/types/replace'
import { getReplaceRuleKey } from '@/utils/replaceRules'

export function upsertRuleList(
  existingRules: ReplaceRule[],
  incomingRules: ReplaceRule[]
): ReplaceRule[] {
  const nextRules = [...existingRules]

  for (const rule of incomingRules) {
    const ruleKey = getReplaceRuleKey(rule)
    const existingIndex = nextRules.findIndex(item => getReplaceRuleKey(item) === ruleKey)

    if (existingIndex >= 0) {
      nextRules[existingIndex] = {
        ...nextRules[existingIndex],
        ...rule,
      }
      continue
    }

    nextRules.push(rule)
  }

  return nextRules
}

export function normalizeReplaceRuleSearchKeyword(keyword: string): string {
  return keyword.trim().toLowerCase()
}

export function filterReplaceRules(rules: ReplaceRule[], keyword = ''): ReplaceRule[] {
  const query = normalizeReplaceRuleSearchKeyword(keyword)
  if (!query) {
    return rules
  }

  return rules.filter(
    rule =>
      rule.name.toLowerCase().includes(query) ||
      rule.pattern.toLowerCase().includes(query) ||
      (rule.scope || '').toLowerCase().includes(query) ||
      (rule.group || '').toLowerCase().includes(query)
  )
}
