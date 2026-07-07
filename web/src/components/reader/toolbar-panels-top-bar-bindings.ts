import { computed } from 'vue'
import type { ReaderToolbarPanelsProps } from './toolbar-panels-prop-types'
import type { ReaderToolbarTopBarProps } from './toolbar-top-bar-prop-types'

export interface ReaderToolbarPanelsTopBarBindings extends ReaderToolbarTopBarProps {
  onBack: () => void
  onToggleCatalog: () => void
  onToggleFullscreen: () => void
}

export function createReaderToolbarPanelsTopBarBindings(
  props: ReaderToolbarPanelsProps
) {
  return computed<ReaderToolbarPanelsTopBarBindings>(() => ({
    ...props.topBarProps,
    onBack: props.onBack!,
    onToggleCatalog: props.onToggleCatalog!,
    onToggleFullscreen: props.onToggleFullscreen!,
  }))
}
