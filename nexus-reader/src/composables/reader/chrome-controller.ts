import { createReaderChromeActions } from './chrome-actions'
import { createReaderChromeState } from './chrome-state'
import type { ReaderChromeActionsResult } from './chrome-display-types'
import type { ReaderChromeActionOptions } from './chrome-option-types'
import type { ReaderChromeState } from './chrome-state'

export function createReaderChromeController(
  options: ReaderChromeActionOptions,
) {
  const state = createReaderChromeState()
  const actions = createReaderChromeActions(state, options)

  return {
    state,
    actions,
  }
}

export type ReaderChromeController = {
  state: ReaderChromeState
  actions: ReaderChromeActionsResult
}
