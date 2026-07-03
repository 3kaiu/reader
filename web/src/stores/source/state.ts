import { shallowRef, ref } from 'vue'
import type { SourceStoreState } from './types'

export function createSourceStoreState(): SourceStoreState {
  return {
    sources: shallowRef([]),
    loading: ref(false),
    loaded: ref(false),
  }
}
