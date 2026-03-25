import { computed } from 'vue'
import type { ReaderKeyboardShortcut } from '@/composables/reader/types'

export interface ReaderKeyboardHelpOverlayProps {
  open: boolean
  shortcuts: ReaderKeyboardShortcut[]
}

export type ReaderKeyboardHelpOverlayEmits = {
  'update:open': [value: boolean]
}

type ReaderKeyboardHelpOverlayEmitFn =
  <EventName extends keyof ReaderKeyboardHelpOverlayEmits>(
    event: EventName,
    ...args: ReaderKeyboardHelpOverlayEmits[EventName]
  ) => void

export function createReaderKeyboardHelpOverlayBindings(
  props: ReaderKeyboardHelpOverlayProps,
  emit: ReaderKeyboardHelpOverlayEmitFn,
) {
  const shortcutItems = computed(() => props.shortcuts)

  function close() {
    emit('update:open', false)
  }

  return {
    shortcutItems,
    close,
  }
}
