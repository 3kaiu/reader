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

  function $reset() {
    const initial = createSourceStoreState()
    for (const key of Object.keys(state) as (keyof typeof state)[]) {
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
