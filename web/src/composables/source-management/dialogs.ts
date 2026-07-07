import type { SourceListItem } from '@/stores/source'
import { createManageModeDialogActions } from '@/composables/manage-mode/dialogs'
import type { SourceManagementState } from './state'

export function createSourceDialogActions(state: SourceManagementState) {
  return createManageModeDialogActions<SourceListItem>(
    state as unknown as Parameters<typeof createManageModeDialogActions<SourceListItem>>[0]
  )
}