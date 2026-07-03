import type { ReaderChromeActionContext } from './chrome-types'
import type { ReaderChromeTimerActions } from './chrome-types'
import { createReaderChromeHideTimerActions } from './chrome-hide-timer'

export function createReaderChromeTimerActions(
  context: ReaderChromeActionContext
): ReaderChromeTimerActions {
  return createReaderChromeHideTimerActions(context)
}
