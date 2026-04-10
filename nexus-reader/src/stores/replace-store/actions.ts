import { createReplaceActionHelpers } from './actions/helpers'
import { createReplaceLoadingActions } from './actions/loading'
import { createReplaceManagementActions } from './actions/management'
import { createReplaceQueryActions } from './actions/query'
import type { ReplaceStoreActions, ReplaceStoreState } from './types'

export function createReplaceStoreActions(state: ReplaceStoreState): ReplaceStoreActions {
  const helperActions = createReplaceActionHelpers(state)
  const queryActions = createReplaceQueryActions(state)
  const loadingActions = createReplaceLoadingActions(state, {
    markRulesLoaded: helperActions.markRulesLoaded,
  })
  const managementActions = createReplaceManagementActions({
    rules: () => state.rules.value,
    setRules: helperActions.setRules,
    getRulesByKeys: queryActions.getRulesByKeys,
  })

  return {
    ...loadingActions,
    ...queryActions,
    ...managementActions,
  }
}
