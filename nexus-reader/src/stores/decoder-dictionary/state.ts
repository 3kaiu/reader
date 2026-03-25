import { ref } from 'vue'
import type { DecoderDictionaryStoreState } from './types'

export function createDecoderDictionaryStoreState(): DecoderDictionaryStoreState {
  return {
    entries: ref([]),
    loading: ref(false),
    loaded: ref(false),
  }
}
