import { $get, $post } from './client'

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
    getReplaceRules: () => $get<ReplaceRule[]>('/getReplaceRules'),

    // Save a rule (add or edit)
    saveReplaceRule: (rule: ReplaceRule) => $post<ReplaceRule>('/saveReplaceRule', rule),

    // Save multiple rules (import)
    saveReplaceRules: (rules: ReplaceRule[]) => $post('/saveReplaceRules', rules),

    // Delete rules
    deleteReplaceRules: (rules: ReplaceRule[]) => $post('/deleteReplaceRules', rules)
}
