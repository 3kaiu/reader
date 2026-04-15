import { computed } from 'vue'
import type { ReplaceStoreState, ReplaceStoreView } from './types'

export function createReplaceStoreView(state: ReplaceStoreState): ReplaceStoreView {
  return {
    enabledCount: computed(() => state.rules.value.filter(rule => rule.isEnabled).length),
  }
}
