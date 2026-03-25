import { onKeyStroke } from '@vueuse/core'

export type ReaderKeyboardEmits = {
  prev: []
  next: []
  'toggle-fullscreen': []
  'toggle-catalog': []
  'toggle-settings': []
  'toggle-day-night': []
  'toggle-zen-mode': []
  'toggle-help': []
  escape: []
}

type ReaderKeyboardEmitFn = <EventName extends keyof ReaderKeyboardEmits>(
  event: EventName,
  ...args: ReaderKeyboardEmits[EventName]
) => void

type ReaderKeyboardShortcut = {
  keys: string | string[]
  event: keyof ReaderKeyboardEmits
  preventDefault?: boolean
}

const READER_KEYBOARD_SHORTCUTS: ReaderKeyboardShortcut[] = [
  {
    keys: ['ArrowLeft', 'ArrowUp'],
    event: 'prev',
    preventDefault: true,
  },
  {
    keys: ['ArrowRight', 'ArrowDown', ' '],
    event: 'next',
    preventDefault: true,
  },
  { keys: 'Escape', event: 'escape' },
  { keys: 'f', event: 'toggle-fullscreen' },
  { keys: 'c', event: 'toggle-catalog' },
  { keys: 's', event: 'toggle-settings' },
  { keys: 'd', event: 'toggle-day-night' },
  { keys: 'z', event: 'toggle-zen-mode' },
  { keys: ['?', 'h'], event: 'toggle-help' },
]

function isEditableTarget(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (!target) return false

  const tagName = target.tagName
  return (
    target.isContentEditable ||
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT'
  )
}

export function registerReaderKeyboardShortcuts(
  emit: ReaderKeyboardEmitFn,
) {
  READER_KEYBOARD_SHORTCUTS.forEach(shortcut => {
    onKeyStroke(shortcut.keys, event => {
      if (isEditableTarget(event)) return

      if (shortcut.preventDefault) {
        event.preventDefault()
      }

      emit(shortcut.event)
    })
  })
}
