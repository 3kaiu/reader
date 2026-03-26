import {
  createReaderKeyboardHelpOverlayViewBindings,
} from './reader-keyboard-help-overlay-view-bindings'
import type {
  ReaderKeyboardHelpOverlayEmitFn,
} from './reader-keyboard-help-overlay-emit-types'
import type {
  ReaderKeyboardHelpOverlayProps,
} from './reader-keyboard-help-overlay-prop-types'

export function createReaderKeyboardHelpOverlayBindings(
  props: ReaderKeyboardHelpOverlayProps,
  emit: ReaderKeyboardHelpOverlayEmitFn,
) {
  return createReaderKeyboardHelpOverlayViewBindings(props, emit)
}
