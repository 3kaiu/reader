import { ref } from 'vue'
import { loadPersistedDecoderSettings } from './persistence'
import type { DecoderStoreState } from './types'

export function createDecoderStoreState(): DecoderStoreState {
  return {
    bookSettings: ref(loadPersistedDecoderSettings()),
    currentBookId: ref(null),
    currentEntities: ref([]),
    currentContext: ref(null),
    isDecoding: ref(false),
    decodeError: ref(null),
    selectedEntity: ref(null),
    cardPosition: ref(null),
  }
}
