import type { ReaderChromeActionsResult } from './chrome-actions-result-types'

export type ReaderChromeLifecycleActions =
  Pick<ReaderChromeActionsResult, 'clearHideTimer'>
