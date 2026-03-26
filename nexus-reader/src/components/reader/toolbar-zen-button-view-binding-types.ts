import type { ComputedRef } from 'vue'

export interface ReaderToolbarZenButtonViewBindings {
  isVisible: ComputedRef<boolean>
  onExit: () => void
}
