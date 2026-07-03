import { createReaderChromeActions } from './chrome-actions'
import { createReaderChromeState } from './chrome-state'
import type { ReaderChromeController } from './chrome-types'
import type { ReaderChromeActionOptions } from './chrome-option-types'

export function createReaderChromeController(
  options: ReaderChromeActionOptions
): ReaderChromeController {
  const state = createReaderChromeState()
  const actions = createReaderChromeActions(state, options)

  return {
    state,
    actions,
  }
}
