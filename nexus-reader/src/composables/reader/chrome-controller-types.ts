import type { ReaderChromeActionsResult } from './chrome-actions-result-types'
import type { ReaderChromeState } from './chrome-state'

export interface ReaderChromeController {
  state: ReaderChromeState
  actions: ReaderChromeActionsResult
}
