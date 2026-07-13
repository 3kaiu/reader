import { getReplaceRuleKey } from '@/utils/replaceRules'
import type { ReplaceRule } from '@/types/replace'
import type { ReplaceRuleManagementContext } from './types'
import {
  createManageModeDeleteActions,
  createManageModeExportActions,
} from '@/composables/manage-mode/management'
import type {
  ManageModeDeleteDeps,
  ManageModeExportDeps,
} from '@/composables/manage-mode/management'

export function createReplaceRuleManagementActions(context: ReplaceRuleManagementContext) {
  const deleteDeps: ManageModeDeleteDeps<ReplaceRule, string> = {
    name: rule => rule.name,
    getKey: getReplaceRuleKey,
    selectedKeys: context.options.selectedRuleKeys,
    setSelection: context.options.setSelection,
    toggleManageMode: context.options.toggleManageMode,
    confirm: context.confirm,
    success: context.success,
    error: context.error,
    warning: context.success,
    handlePromiseError: context.handlePromiseError,
    deleteByIds: keys => context.replaceStore.deleteRulesByKeys(keys),
  }
  const { deleteItem, batchDelete } = createManageModeDeleteActions(deleteDeps)

  const exportDeps: ManageModeExportDeps<ReplaceRule, string> = {
    selectedKeys: context.options.selectedRuleKeys,
    filteredItems: context.options.filteredRules,
    getExportItems: (selected, filtered) => context.replaceStore.getExportRules(selected, filtered),
    buildExportFilename: () => `replacerules_${Date.now()}.json`,
    success: context.success,
    error: context.error,
    handlePromiseError: context.handlePromiseError,
  }
  const { exportItems } = createManageModeExportActions(exportDeps)

  return {
    deleteRule: deleteItem,
    batchDelete,
    exportRules: exportItems,
  }
}
