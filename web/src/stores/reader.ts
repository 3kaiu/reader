import { defineStore } from 'pinia'
import { createReaderStoreActions } from './reader/actions'
import { createReaderStoreState } from './reader/state'
import { createReaderStoreView } from './reader/view'
import type { ReaderStoreState } from './reader/types'

export const useReaderStore = defineStore('reader', () => {
  const state = createReaderStoreState()
  const view = createReaderStoreView(state)
  const actions = createReaderStoreActions(state, view)

  function $reset() {
    const initial = createReaderStoreState()
    for (const key of Object.keys(state) as (keyof ReaderStoreState)[]) {
      const ref = state[key]
      const initialRef = initial[key]
      if ('value' in ref && 'value' in initialRef) {
        ;(ref as { value: unknown }).value = (initialRef as { value: unknown }).value
      }
    }
  }

  return {
    ...state,
    ...view,
    ...actions,
    $reset,
  }
})
