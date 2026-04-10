import { computed } from 'vue'
import type { ReaderKeyboardHelpDialogProps } from './reader-keyboard-help-dialog-prop-types'
import type { ReaderKeyboardHelpOverlayEmitFn } from './reader-keyboard-help-overlay-emit-types'
import type { ReaderKeyboardHelpOverlayProps } from './reader-keyboard-help-overlay-prop-types'
import type { ReaderKeyboardHelpOverlayViewBindings } from './reader-keyboard-help-overlay-view-binding-types'

export function createReaderKeyboardHelpOverlayViewBindings(
  props: ReaderKeyboardHelpOverlayProps,
  emit: ReaderKeyboardHelpOverlayEmitFn
): ReaderKeyboardHelpOverlayViewBindings {
  function onClose() {
    emit('update:open', false)
  }

  return {
    isOpen: computed(() => props.open),
    dialogProps: computed<ReaderKeyboardHelpDialogProps>(() => ({
      shortcutItems: props.shortcuts,
    })),
    onClose,
  }
}
