import type { ReaderToolbarBindingResult } from './toolbar-binding-types'
import { createReaderToolbarPanelBindings } from './toolbar-panel-bindings'
import type { ReaderToolbarProps } from './toolbar-prop-types'
import {
  createReaderToolbarZenButtonBindings,
} from './toolbar-zen-button-bindings'

export function createReaderToolbarBindings(
  props: ReaderToolbarProps,
): ReaderToolbarBindingResult {
  return {
    panelsProps: createReaderToolbarPanelBindings(props),
    zenButtonProps: createReaderToolbarZenButtonBindings(props),
  }
}
