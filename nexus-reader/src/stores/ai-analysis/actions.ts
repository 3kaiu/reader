import { createAiAnalysisHistoryActions } from './actions/history'
import { createAiAnalysisLoadingActions } from './actions/loading'
import { createAiAnalysisMappingsActions } from './actions/mappings'
import type { AiAnalysisStoreActions, AiAnalysisStoreState } from './types'

export function createAiAnalysisStoreActions(
  state: AiAnalysisStoreState
): AiAnalysisStoreActions {
  const loadingActions = createAiAnalysisLoadingActions(state)
  const mappingActions = createAiAnalysisMappingsActions({
    loadMappings: loadingActions.loadMappings,
  })
  const historyActions = createAiAnalysisHistoryActions(state)

  return {
    ...loadingActions,
    ...historyActions,
    ...mappingActions,
    exportMappings: () => mappingActions.exportMappings(state.mappings.value),
  }
}
