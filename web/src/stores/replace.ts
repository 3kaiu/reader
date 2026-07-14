import { defineStore } from 'pinia'
import { createReplaceStoreActions } from './replace-store/actions'
import { createReplaceStoreState } from './replace-store/state'
import { createReplaceStoreView } from './replace-store/view'

export type {
  DeleteReplaceRulesResult,
  ImportReplaceRulesResult,
  SaveReplaceRuleDraftResult,
} from './replace-store/types'

export const useReplaceStore = defineStore('replace', () => {
  const state = createReplaceStoreState()
  const view = createReplaceStoreView(state)
  const actions = createReplaceStoreActions(state)

  function $reset() {
    const initial = createReplaceStoreState()
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
