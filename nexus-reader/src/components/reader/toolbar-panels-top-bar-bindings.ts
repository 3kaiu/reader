import { computed } from 'vue'
import type { ReaderToolbarPanelsEmitFn } from './toolbar-panels-emit-types'
import type { ReaderToolbarPanelsProps } from './toolbar-panels-prop-types'
import type { ReaderToolbarTopBarProps } from './toolbar-top-bar-prop-types'

export interface ReaderToolbarPanelsTopBarBindings extends ReaderToolbarTopBarProps {
  onBack: () => void
  onToggleCatalog: () => void
  onToggleFullscreen: () => void
}

export function createReaderToolbarPanelsTopBarBindings(
  props: ReaderToolbarPanelsProps,
  emit: ReaderToolbarPanelsEmitFn
) {
  return computed<ReaderToolbarPanelsTopBarBindings>(() => ({
    ...props.topBarProps,
    onBack: () => emit('back'),
    onToggleCatalog: () => emit('toggleCatalog'),
    onToggleFullscreen: () => emit('toggleFullscreen'),
  }))
}
