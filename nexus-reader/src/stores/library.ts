import { defineStore } from 'pinia'
import { createLibraryStoreActions } from './library-store/actions'
import { createLibraryStoreState } from './library-store/state'
import { createLibraryStoreView } from './library-store/view'

export type {
  DeleteBooksResult,
  EnsureBookResult,
} from './library-store/types'

export const useLibraryStore = defineStore('library', () => {
  const state = createLibraryStoreState()
  const view = createLibraryStoreView(state)
  const actions = createLibraryStoreActions(state, view)

  return {
    ...state,
    ...view,
    ...actions,
  }
})
