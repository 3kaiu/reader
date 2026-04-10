import type { createReaderToolbarPanelBindings } from './toolbar-panel-bindings'

export interface ReaderToolbarBindingResult {
  panelsProps: ReturnType<typeof createReaderToolbarPanelBindings>
}
