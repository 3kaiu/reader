import { createAiAnalysisMappingsDeleteActions } from './mappings-delete'
import { createAiAnalysisMappingsDraftActions } from './mappings-draft'
import { createAiAnalysisMappingsExportActions } from './mappings-export'
import { createAiAnalysisMappingsImportActions } from './mappings-import'
import { createAiAnalysisMappingsSaveActions } from './mappings-save'
import type { AiAnalysisMappingsHelpers } from './mappings-shared'

export function createAiAnalysisMappingsActions(
  helpers: AiAnalysisMappingsHelpers,
) {
  const saveActions = createAiAnalysisMappingsSaveActions(helpers)
  const draftActions = createAiAnalysisMappingsDraftActions({
    saveMapping: saveActions.saveMapping,
  })
  const deleteActions = createAiAnalysisMappingsDeleteActions({
    helpers,
    saveMapping: saveActions.saveMapping,
  })
  const exportActions = createAiAnalysisMappingsExportActions()
  const importActions = createAiAnalysisMappingsImportActions(helpers)

  return {
    ...saveActions,
    ...draftActions,
    ...deleteActions,
    ...exportActions,
    ...importActions,
  }
}
