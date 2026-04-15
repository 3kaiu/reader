import type { ReaderKeyboardHelpHeaderEmitFn } from './reader-keyboard-help-header-emit-types'

export function createReaderKeyboardHelpHeaderViewBindings(
  emit: ReaderKeyboardHelpHeaderEmitFn
) {
  return {
    onClose: () => emit('close'),
  }
}
