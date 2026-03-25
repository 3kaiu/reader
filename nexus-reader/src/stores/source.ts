import { defineStore } from 'pinia'
import { createSourceStoreActions } from './source/actions'
import { createSourceStoreState } from './source/state'
import { createSourceStoreView } from './source/view'

export type {
  DeleteSourcesResult,
  ImportSourceTextResult,
  ImportSourcesResult,
  SourceDetailTextResult,
  SourceListItem,
} from './source/types'

export const useSourceStore = defineStore('source', () => {
  const state = createSourceStoreState()
  const view = createSourceStoreView(state)
  const actions = createSourceStoreActions(state)

  return {
    ...state,
    ...view,
    ...actions,
  }
})
