import { createReaderChromeBindingState } from './chrome-binding-state'
import type { ReaderChromeBindingsResult } from './chrome-binding-types'
import type { ReaderChromeActionsResult } from './chrome-types'
import type { ReaderChromeState } from './chrome-state'

export function createReaderChromeBindings(
  state: ReaderChromeState,
  actions: ReaderChromeActionsResult
): ReaderChromeBindingsResult {
  const { clearHideTimer, ...displayActions } = actions

  return {
    ...createReaderChromeBindingState(state),
    ...displayActions,
  }
}
