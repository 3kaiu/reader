import type { ReplaceRule } from '@/types/replace'
import { createManageModeState } from '@/composables/manage-mode/state'
import { type Ref } from 'vue'

export interface ReplaceRuleManagementState {
  showImport: Ref<boolean>
  showEdit: Ref<boolean>
  currentEditRule: Ref<ReplaceRule | null>
}

export function createReplaceRuleManagementState(): ReplaceRuleManagementState {
  const inner = createManageModeState<ReplaceRule>()
  return {
    showImport: inner.showImport,
    showEdit: inner.showEdit,
    get currentEditRule() {
      return inner.currentEditItem as Ref<ReplaceRule | null>
    },
  }
}
