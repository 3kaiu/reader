import { ref, type Ref } from 'vue'

export interface ManageModeState<T> {
  showImport: Ref<boolean>
  showEdit: Ref<boolean>
  currentEditItem: Ref<T | null>
}

export function createManageModeState<T>(): ManageModeState<T> {
  return {
    showImport: ref(false),
    showEdit: ref(false),
    currentEditItem: ref(null) as Ref<T | null>,
  }
}
