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

  return {
    ...state,
    ...view,
    ...actions,
  }
})
