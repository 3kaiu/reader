import type { SourceListItem } from '@/stores/source'
import { createManageModeState } from '@/composables/manage-mode/state'
import { type Ref } from 'vue'

export interface SourceManagementState {
  showImport: Ref<boolean>
  showEdit: Ref<boolean>
  currentEditSource: Ref<SourceListItem | null>
}

export function createSourceManagementState(): SourceManagementState {
  const inner = createManageModeState<SourceListItem>()
  return {
    showImport: inner.showImport,
    showEdit: inner.showEdit,
    get currentEditSource() {
      return inner.currentEditItem as Ref<SourceListItem | null>
    },
  }
}
