import { defineStore } from 'pinia'
import { createDecoderStoreActions } from './decoder-store/actions'
import { createDecoderStoreState } from './decoder-store/state'
import { createDecoderStoreView } from './decoder-store/view'

export const useDecoderStore = defineStore('decoder', () => {
  const state = createDecoderStoreState()
  const view = createDecoderStoreView(state)
  const actions = createDecoderStoreActions(state)

  return {
    ...state,
    ...view,
    ...actions,
  }
})
