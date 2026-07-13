import type { SourceListItem } from '@/stores/source'
import type { SourceManagementContext } from './types'
import {
  createManageModeDeleteActions,
  createManageModeExportActions,
} from '@/composables/manage-mode/management'
import type {
  ManageModeDeleteDeps,
  ManageModeExportDeps,
} from '@/composables/manage-mode/management'

export function createSourceManagementActions(context: SourceManagementContext) {
  const deleteDeps: ManageModeDeleteDeps<SourceListItem, string> = {
    name: source => source.name,
    getKey: source => source.id,
    selectedKeys: context.options.selectedSourceIds,
    setSelection: context.options.setSelection,
    toggleManageMode: context.options.toggleManageMode,
    confirm: context.confirm,
    success: context.success,
    error: context.error,
    warning: context.warning,
    handlePromiseError: context.handlePromiseError,
    deleteByIds: ids => context.sourceStore.deleteSourceIds(ids),
  }
  const { deleteItem, batchDelete } = createManageModeDeleteActions(deleteDeps)

  const exportDeps: ManageModeExportDeps<SourceListItem, string> = {
    selectedKeys: context.options.selectedSourceIds,
    filteredItems: context.options.filteredSources,
    getExportItems: (selected, filtered) =>
      context.sourceStore.getExportSources(selected, filtered),
    buildExportFilename: () => `booksources_${Date.now()}.json`,
    success: context.success,
    error: context.error,
    handlePromiseError: context.handlePromiseError,
  }
  const { exportItems } = createManageModeExportActions(exportDeps)

  function deleteGroupSources(groupName: string) {
    context.warning(`当前版本暂不支持删除整组书源（分组：${groupName}）`)
  }

  return {
    deleteSource: deleteItem,
    batchDelete,
    exportSources: exportItems,
    deleteGroupSources,
  }
}
