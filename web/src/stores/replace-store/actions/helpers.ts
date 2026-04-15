import type { ReplaceRule } from '@/types/replace'
import type { ReplaceStoreState } from '../types'

export function createReplaceActionHelpers(state: ReplaceStoreState) {
  function setRules(nextRules: ReplaceRule[]): void {
    state.rules.value = nextRules
  }

  function markRulesLoaded(nextRules: ReplaceRule[]): void {
    state.rules.value = nextRules
    state.loaded.value = true
  }

  return {
    setRules,
    markRulesLoaded,
  }
}
