import type { ReaderKeyboardEmits } from './reader-keyboard-emit-types'

export type ReaderKeyboardShortcutDefinition = {
  keys: string | string[]
  event: keyof ReaderKeyboardEmits
  preventDefault?: boolean
}

export const READER_KEYBOARD_SHORTCUTS: ReaderKeyboardShortcutDefinition[] = [
  { keys: 'Escape', event: 'escape' },
  { keys: 'f', event: 'toggle-fullscreen' },
  { keys: 'c', event: 'toggle-catalog' },
  { keys: 's', event: 'toggle-settings' },
  { keys: 'd', event: 'toggle-day-night' },
  { keys: ['?', 'h'], event: 'toggle-help' },
]
