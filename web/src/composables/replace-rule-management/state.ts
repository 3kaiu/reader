import { ref } from 'vue'
import type { ReplaceRuleManagementState } from './types'

export function createReplaceRuleManagementState(): ReplaceRuleManagementState {
  return {
    showImport: ref(false),
    showEdit: ref(false),
    currentEditRule: ref(null),
  }
}
