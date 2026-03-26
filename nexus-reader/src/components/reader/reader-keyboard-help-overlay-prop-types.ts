import type { ReaderKeyboardShortcut } from '@/composables/reader/shared-types'

export interface ReaderKeyboardHelpOverlayProps {
  open: boolean
  shortcuts: ReaderKeyboardShortcut[]
}
