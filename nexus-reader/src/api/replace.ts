import { $get, $post, $delete } from './client'

export interface ReplaceRule {
    id?: number | string
    name: string
    pattern: string
    replacement: string
    scope: string
    isEnabled: boolean
    isRegex: boolean
    group?: string // Added for future grouping if needed, present in some versions
}

export const replaceApi = {
    // Get all rules
    getReplaceRules: () => $get<ReplaceRule[]>('/replace_rules'),

    // Save a rule (add or edit)
    saveReplaceRule: (rule: ReplaceRule) => $post<ReplaceRule>('/replace_rules', rule),

    // Save multiple rules (import)
    saveReplaceRules: async (rules: ReplaceRule[]) => {
        const results = await Promise.all(rules.map(rule => $post('/replace_rules', rule)))
        return {
            isSuccess: results.every(r => r.isSuccess),
            data: results.map(r => r.data),
            errorMsg: results.find(r => !r.isSuccess)?.errorMsg
        }
    },

    // Delete rules
    deleteReplaceRules: async (rules: ReplaceRule[]) => {
        const results = await Promise.all(rules.map(rule => $delete(`/replace_rules/${rule.id}`)))
        return {
            isSuccess: results.every(r => r.isSuccess),
            data: results.map(r => r.data),
            errorMsg: results.find(r => !r.isSuccess)?.errorMsg
        }
    }
}
