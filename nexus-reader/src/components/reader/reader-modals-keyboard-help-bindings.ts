import { computed } from 'vue'
import type { ReaderModalsEmitFn } from './reader-modals-emit-types'
import type { ReaderModalsProps } from './reader-modals-prop-types'

export function createReaderKeyboardHelpModalBindings(
  props: ReaderModalsProps,
  emit: ReaderModalsEmitFn,
) {
  return computed(() => ({
    open: props.showKeyboardHelp,
    shortcuts: props.keyboardShortcuts,
    'onUpdate:open': (value: boolean) =>
      emit('update:showKeyboardHelp', value),
  }))
}
