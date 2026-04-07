import type { ComputedRef } from 'vue'

export interface ReaderErrorStateViewBindings {
  errorMessage: ComputedRef<string>
  errorDetails: ComputedRef<string | null | undefined>
  onOpenSourcePicker: () => void
  onRetryLoad: () => void
}
