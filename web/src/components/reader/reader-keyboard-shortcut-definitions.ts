import type { ReaderKeyboardEmits } from './reader-keyboard-emit-types'

export type ReaderKeyboardShortcutDefinition = {
  keys: string | string[]
  event: keyof ReaderKeyboardEmits
  preventDefault?: boolean
}

export const READER_KEYBOARD_SHORTCUTS: ReaderKeyboardShortcutDefinition[] = [
  // Navigation
  { keys: 'Escape', event: 'escape' },
  { keys: 'f', event: 'toggle-fullscreen' },
  { keys: 'c', event: 'toggle-catalog' },
  { keys: 's', event: 'toggle-settings' },
  { keys: 'd', event: 'toggle-day-night' },
  { keys: ['?', 'h'], event: 'toggle-help' },

  // Scroll & chapter navigation (微信读书风格)
  { keys: ' ', event: 'scroll-page-down', preventDefault: true },
  { keys: 'j', event: 'scroll-down' },
  { keys: 'k', event: 'scroll-up' },
  { keys: '[', event: 'prev-chapter' },
  { keys: ']', event: 'next-chapter' },
  { keys: 't', event: 'cycle-theme' },
]
