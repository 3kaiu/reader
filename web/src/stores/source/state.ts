import { ref } from 'vue'
import type { SourceStoreState } from './types'

export function createSourceStoreState(): SourceStoreState {
  return {
    sources: ref([]),
    loading: ref(false),
    loaded: ref(false),
  }
}
