import { ref } from 'vue'
import type { SourceManagementState } from './types'

export function createSourceManagementState(): SourceManagementState {
  return {
    showImport: ref(false),
    showEdit: ref(false),
    currentEditSource: ref(null),
  }
}
