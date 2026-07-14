import { defineStore } from 'pinia'
import { createLibraryStoreActions } from './library-store/actions'
import { createLibraryStoreState } from './library-store/state'
import { createLibraryStoreView } from './library-store/view'
import type { LibraryStoreState } from './library-store/types'

export type { DeleteBooksResult, EnsureBookResult } from './library-store/types'

export const useLibraryStore = defineStore('library', () => {
  const state = createLibraryStoreState()
  const view = createLibraryStoreView(state)
  const actions = createLibraryStoreActions(state, view)

  function $reset() {
    const initial = createLibraryStoreState()
    for (const key of Object.keys(state) as (keyof LibraryStoreState)[]) {
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
