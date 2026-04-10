import { createSourceBatchActions } from './actions/batch'
import { createSourceLoadingActions } from './actions/loading'
import { createSourceQueryActions } from './actions/query'
import type { SourceStoreActions, SourceStoreState } from './types'

export function createSourceStoreActions(state: SourceStoreState): SourceStoreActions {
  const loadingActions = createSourceLoadingActions(state)
  const queryActions = createSourceQueryActions(state)
  const batchActions = createSourceBatchActions(state, {
    loadSources: loadingActions.loadSources,
  })

  return {
    ...loadingActions,
    ...queryActions,
    ...batchActions,
  }
}
