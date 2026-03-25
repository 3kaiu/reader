import { computed } from 'vue'
import type {
  DecoderDictionaryStoreState,
  DecoderDictionaryStoreView,
} from './types'

export function createDecoderDictionaryStoreView(
  state: DecoderDictionaryStoreState
): DecoderDictionaryStoreView {
  return {
    categoryStats: computed(() => ({
      person: state.entries.value.filter(entry => entry.category === 'person').length,
      company: state.entries.value.filter(entry => entry.category === 'company').length,
      place: state.entries.value.filter(entry => entry.category === 'place').length,
      event: state.entries.value.filter(entry => entry.category === 'event').length,
      organization: state.entries.value.filter(entry => entry.category === 'organization').length,
    })),
  }
}
