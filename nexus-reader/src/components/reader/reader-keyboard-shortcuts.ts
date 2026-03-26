import { onKeyStroke } from '@vueuse/core'
import type {
  ReaderKeyboardEmitFn,
} from './reader-keyboard-emit-types'
import { READER_KEYBOARD_SHORTCUTS } from './reader-keyboard-shortcut-definitions'
import { isReaderKeyboardEditableTarget } from './reader-keyboard-target-guards'

export function registerReaderKeyboardShortcuts(
  emit: ReaderKeyboardEmitFn,
) {
  READER_KEYBOARD_SHORTCUTS.forEach(shortcut => {
    onKeyStroke(shortcut.keys, event => {
      if (isReaderKeyboardEditableTarget(event)) return

      if (shortcut.preventDefault) {
        event.preventDefault()
      }

      emit(shortcut.event)
    })
  })
}
