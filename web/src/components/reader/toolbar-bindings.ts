import { createReaderToolbarPanelsPropsBindings } from './toolbar-panel-bindings'
import type { ReaderToolbarProps } from './toolbar-prop-types'

export interface ReaderToolbarBindingResult {
  panelsProps: ReturnType<typeof createReaderToolbarPanelsPropsBindings>
}

export function createReaderToolbarBindings(props: ReaderToolbarProps): ReaderToolbarBindingResult {
  return {
    panelsProps: createReaderToolbarPanelsPropsBindings(props),
  }
}
