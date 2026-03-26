import type { ComputedRef } from 'vue'

export interface ReaderErrorStateViewBindings {
  errorMessage: ComputedRef<string>
  onOpenSourcePicker: () => void
}
