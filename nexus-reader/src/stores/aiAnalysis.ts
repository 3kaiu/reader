import { defineStore } from 'pinia'
import { createAiAnalysisStoreActions } from './ai-analysis/actions'
import { createAiAnalysisStoreState } from './ai-analysis/state'
import { createAiAnalysisStoreView } from './ai-analysis/view'

export type {
  ImportAiMappingsResult,
  SaveAiMappingDraftResult,
} from './ai-analysis/types'

export const useAiAnalysisStore = defineStore('ai-analysis', () => {
  const state = createAiAnalysisStoreState()
  const view = createAiAnalysisStoreView(state)
  const actions = createAiAnalysisStoreActions(state)

  return {
    ...state,
    ...view,
    ...actions,
  }
})
