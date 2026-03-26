import type { ComputedRef } from 'vue'

export interface ReaderKeyboardShortcutItemViewBindings {
  shortcutKey: ComputedRef<string>
  shortcutDescription: ComputedRef<string>
}
