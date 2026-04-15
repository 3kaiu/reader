import type { ReaderChromeActionOptions } from './chrome-option-types'
import type { ReaderChromeState } from './chrome-state'

export interface ReaderChromeActionContext {
  state: ReaderChromeState
  options: ReaderChromeActionOptions
}
