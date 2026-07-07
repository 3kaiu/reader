import type { ReplaceRule } from '@/types/replace'
import { filterReplaceRules } from '@/stores/replace-store/helpers'
import { getReplaceRuleKey } from '@/utils/replaceRules'
import type { ReplaceStoreState } from '../types'

export function createReplaceQueryActions(state: ReplaceStoreState) {
  function filterRules(keyword = ''): ReplaceRule[] {
    return filterReplaceRules(state.rules.value, keyword)
  }

  function getRulesByKeys(keys: Iterable<string>): ReplaceRule[] {
    const targetKeys = new Set(Array.from(keys).filter(Boolean))
    if (targetKeys.size === 0) {
      return []
    }

    return state.rules.value.filter(rule => targetKeys.has(getReplaceRuleKey(rule)))
  }

  function getExportRules(
    keys?: Iterable<string>,
    fallback: ReplaceRule[] = state.rules.value
  ): ReplaceRule[] {
    const selectedRules = keys ? getRulesByKeys(keys) : []
    return selectedRules.length > 0 ? selectedRules : fallback
  }

  return {
    filterRules,
    getRulesByKeys,
    getExportRules,
  }
}
