import type { ReplaceRule } from '@/types/replace'
import { createManageModeDialogActions } from '@/composables/manage-mode/dialogs'
import type { ReplaceRuleManagementState } from './state'

export function createReplaceRuleDialogActions(state: ReplaceRuleManagementState) {
  return createManageModeDialogActions<ReplaceRule>(
    state as unknown as Parameters<typeof createManageModeDialogActions<ReplaceRule>>[0]
  )
}