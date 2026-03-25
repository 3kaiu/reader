import type { DictionaryEntry } from '@/types/decoder'
import type { DecoderDictionaryStoreState } from '../types'

export function createDecoderDictionaryActionHelpers(
  state: DecoderDictionaryStoreState,
) {
  function applyEntries(nextEntries: DictionaryEntry[]): void {
    state.entries.value = nextEntries
    state.loaded.value = true
  }

  return {
    applyEntries,
  }
}
