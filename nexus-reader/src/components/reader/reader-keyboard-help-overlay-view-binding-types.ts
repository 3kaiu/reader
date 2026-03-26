import type { ComputedRef } from 'vue'
import type {
  ReaderKeyboardHelpDialogProps,
} from './reader-keyboard-help-dialog-prop-types'

export interface ReaderKeyboardHelpOverlayViewBindings {
  isOpen: ComputedRef<boolean>
  dialogProps: ComputedRef<ReaderKeyboardHelpDialogProps>
  onClose: () => void
}
