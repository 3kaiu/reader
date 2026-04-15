import { defineStore } from 'pinia'
import { createReaderStoreActions } from './reader/actions'
import { createReaderStoreState } from './reader/state'
import { createReaderStoreView } from './reader/view'

export const useReaderStore = defineStore('reader', () => {
  const state = createReaderStoreState()
  const view = createReaderStoreView(state)
  const actions = createReaderStoreActions(state, view)

  return {
    ...state,
    ...view,
    ...actions,
  }
})
