import { computed } from 'vue'
import type { ReaderKeyboardShortcutItemProps } from './reader-keyboard-shortcut-item-prop-types'

export function createReaderKeyboardShortcutItemViewBindings(
  props: ReaderKeyboardShortcutItemProps
) {
  return {
    shortcutKey: computed(() => props.shortcut.key),
    shortcutDescription: computed(() => props.shortcut.desc),
  }
}
