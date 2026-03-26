import type {
  createReaderToolbarPanelBindings,
} from './toolbar-panel-bindings'
import type {
  createReaderToolbarZenButtonBindings,
} from './toolbar-zen-button-bindings'

export interface ReaderToolbarBindingResult {
  panelsProps: ReturnType<typeof createReaderToolbarPanelBindings>
  zenButtonProps: ReturnType<typeof createReaderToolbarZenButtonBindings>
}
