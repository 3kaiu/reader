import { computed } from 'vue'
import type {
  ReaderToolbarPanelsTopBarBindings,
} from './toolbar-panels-binding-types'
import type {
  ReaderToolbarPanelsEmitFn,
} from './toolbar-panels-emit-types'
import type { ReaderToolbarPanelsProps } from './toolbar-panels-prop-types'

export function createReaderToolbarPanelsTopBarBindings(
  props: ReaderToolbarPanelsProps,
  emit: ReaderToolbarPanelsEmitFn,
) {
  return computed<ReaderToolbarPanelsTopBarBindings>(() => ({
    ...props.topBarProps,
    onBack: () => emit('back'),
    onToggleCatalog: () => emit('toggleCatalog'),
    onToggleFullscreen: () => emit('toggleFullscreen'),
  }))
}
