import type { ReplaceRule } from '@/types/replace'
import type { ReplaceRuleManagementState } from './types'

export function createReplaceRuleDialogActions(
  state: ReplaceRuleManagementState,
) {
  function openImport() {
    state.showImport.value = true
  }

  function openEdit(rule?: ReplaceRule) {
    state.currentEditRule.value = rule || null
    state.showEdit.value = true
  }

  return {
    openImport,
    openEdit,
  }
}
