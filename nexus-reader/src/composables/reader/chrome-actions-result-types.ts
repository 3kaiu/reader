import type { ReaderChromeDisplayActions } from './chrome-display-action-types'

export interface ReaderChromeActionsResult
  extends ReaderChromeDisplayActions {
  clearHideTimer: () => void
}
