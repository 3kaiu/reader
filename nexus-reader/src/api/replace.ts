import type { ApiResponse } from './client'
import { $delete, $get, $post } from './client'

export interface ReplaceRule {
  id?: string
  name: string
  pattern: string
  replacement?: string | null
  scope?: string | null
  isEnabled: boolean
  isRegex: boolean
  group?: string
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function normalizeRulePayload(rule: ReplaceRule) {
  return {
    id: typeof rule.id === 'string' ? rule.id : '',
    name: rule.name.trim(),
    pattern: rule.pattern.trim(),
    replacement: normalizeOptionalText(rule.replacement),
    scope: normalizeOptionalText(rule.scope),
    isEnabled: Boolean(rule.isEnabled),
    isRegex: Boolean(rule.isRegex),
  }
}

export const replaceApi = {
  getReplaceRules: () => $get<ReplaceRule[]>('/replace_rules'),

  saveReplaceRule: (rule: ReplaceRule) =>
    $post<ReplaceRule>('/replace_rules', normalizeRulePayload(rule)),

  saveReplaceRules: async (rules: ReplaceRule[]): Promise<ApiResponse<ReplaceRule[]>> => {
    const results = await Promise.all(
      rules.map(rule => $post<ReplaceRule>('/replace_rules', normalizeRulePayload(rule)))
    )

    return {
      isSuccess: results.every(result => result.isSuccess),
      data: results.map(result => result.data).filter(Boolean) as ReplaceRule[],
      errorMsg: results.find(result => !result.isSuccess)?.errorMsg,
    }
  },

  deleteReplaceRules: async (rules: ReplaceRule[]): Promise<ApiResponse<null[]>> => {
    if (rules.some(rule => !rule.id)) {
      return {
        isSuccess: false,
        data: [],
        errorMsg: '规则缺少 ID，无法删除',
      }
    }

    const results = await Promise.all(
      rules.map(rule => $delete<null>(`/replace_rules/${rule.id}`))
    )

    return {
      isSuccess: results.every(result => result.isSuccess),
      data: results.map(result => result.data),
      errorMsg: results.find(result => !result.isSuccess)?.errorMsg,
    }
  },
}
