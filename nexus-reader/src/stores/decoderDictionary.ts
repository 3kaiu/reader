import { defineStore } from 'pinia'
import { createDecoderDictionaryStoreActions } from './decoder-dictionary/actions'
import { createDecoderDictionaryStoreState } from './decoder-dictionary/state'
import { createDecoderDictionaryStoreView } from './decoder-dictionary/view'

export type {
  ImportDecoderEntriesResult,
  SaveDecoderEntryDraftResult,
} from './decoder-dictionary/types'

export const useDecoderDictionaryStore = defineStore('decoder-dictionary', () => {
  const state = createDecoderDictionaryStoreState()
  const view = createDecoderDictionaryStoreView(state)
  const actions = createDecoderDictionaryStoreActions(state)

  return {
    ...state,
    ...view,
    ...actions,
  }
})
