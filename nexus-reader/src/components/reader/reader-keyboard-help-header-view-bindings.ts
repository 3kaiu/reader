import type {
  ReaderKeyboardHelpHeaderEmitFn,
} from './reader-keyboard-help-header-emit-types'
import type {
  ReaderKeyboardHelpHeaderViewBindings,
} from './reader-keyboard-help-header-view-binding-types'

export function createReaderKeyboardHelpHeaderViewBindings(
  emit: ReaderKeyboardHelpHeaderEmitFn,
): ReaderKeyboardHelpHeaderViewBindings {
  return {
    onClose: () => emit('close'),
  }
}
