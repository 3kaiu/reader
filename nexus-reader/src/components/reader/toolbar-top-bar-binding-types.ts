import type { ComputedRef } from 'vue'
import type { ReaderToolbarTopBarProps } from './toolbar-top-bar-prop-types'

export interface ReaderToolbarTopBarContentBindings extends ReaderToolbarTopBarProps {
  onBack: () => void
  onToggleCatalog: () => void
  onToggleFullscreen: () => void
}

export interface ReaderToolbarTopBarBindingResult {
  contentBindings: ComputedRef<ReaderToolbarTopBarContentBindings>
  isVisible: ComputedRef<boolean>
}
