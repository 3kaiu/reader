import type { ComputedRef } from 'vue'

export interface ReaderToolbarActionButtonViewBindings {
  buttonClass: ComputedRef<string>
  onClick: () => void
  onContextmenu: (event: MouseEvent) => void
}
