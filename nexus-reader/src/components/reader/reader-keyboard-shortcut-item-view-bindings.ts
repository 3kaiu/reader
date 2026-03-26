import { computed } from 'vue'
import type {
  ReaderKeyboardShortcutItemProps,
} from './reader-keyboard-shortcut-item-prop-types'
import type {
  ReaderKeyboardShortcutItemViewBindings,
} from './reader-keyboard-shortcut-item-view-binding-types'

export function createReaderKeyboardShortcutItemViewBindings(
  props: ReaderKeyboardShortcutItemProps,
): ReaderKeyboardShortcutItemViewBindings {
  return {
    shortcutKey: computed(() => props.shortcut.key),
    shortcutDescription: computed(() => props.shortcut.desc),
  }
}
