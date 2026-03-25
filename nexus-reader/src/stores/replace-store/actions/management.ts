import { createReplaceManagementDeleteActions } from './management-delete'
import { createReplaceManagementDraftActions } from './management-draft'
import { createReplaceManagementImportActions } from './management-import'
import { createReplaceManagementSaveActions } from './management-save'
import { createReplaceManagementToggleActions } from './management-toggle'
import type { ReplaceManagementHelpers } from './management-shared'

export function createReplaceManagementActions(
  helpers: ReplaceManagementHelpers,
) {
  const saveActions = createReplaceManagementSaveActions(helpers)
  const draftActions = createReplaceManagementDraftActions({
    saveRule: saveActions.saveRule,
  })
  const importActions = createReplaceManagementImportActions({
    saveRules: saveActions.saveRules,
  })
  const deleteActions = createReplaceManagementDeleteActions(helpers)
  const toggleActions = createReplaceManagementToggleActions(helpers)

  return {
    ...saveActions,
    ...draftActions,
    ...importActions,
    ...deleteActions,
    ...toggleActions,
  }
}
