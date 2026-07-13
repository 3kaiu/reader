import type { ManageModeState } from './state'

export function createManageModeDialogActions<T>(state: ManageModeState<T>) {
  function openImport() {
    state.showImport.value = true
  }

  function openEdit(item?: T) {
    state.currentEditItem.value = item ?? null
    state.showEdit.value = true
  }

  return {
    openImport,
    openEdit,
  }
}
