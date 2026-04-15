import type { ReplaceRule } from '@/types/replace'

export interface ReplaceManagementHelpers {
  rules: () => ReplaceRule[]
  setRules: (nextRules: ReplaceRule[]) => void
  getRulesByKeys: (keys: Iterable<string>) => ReplaceRule[]
}
