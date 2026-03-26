import type { ComputedRef } from 'vue'

export interface ReaderNavigationButtonViewBindings {
  buttonClass: ComputedRef<Record<string, boolean>>
  onClick: () => void
}
