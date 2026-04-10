import type { SourceListItem } from '@/stores/source'
import type { SourceManagementState } from './types'

export function createSourceDialogActions(state: SourceManagementState) {
  function openImport() {
    state.showImport.value = true
  }

  function openEdit(source: SourceListItem) {
    state.currentEditSource.value = source
    state.showEdit.value = true
  }

  return {
    openImport,
    openEdit,
  }
}
