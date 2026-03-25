import { ref } from 'vue'
import type { ReplaceStoreState } from './types'

export function createReplaceStoreState(): ReplaceStoreState {
  return {
    rules: ref([]),
    loading: ref(false),
    loaded: ref(false),
  }
}
