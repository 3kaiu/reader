import type { ReaderChromeActionContext } from './chrome-context-types'
import type { ReaderChromeTimerActions } from './chrome-timer-action-types'
import { createReaderChromeHideTimerClearAction } from './chrome-hide-timer-clear'
import { createReaderChromeHideTimerStartAction } from './chrome-hide-timer-start'

export function createReaderChromeTimerActions(
  context: ReaderChromeActionContext
): ReaderChromeTimerActions {
  const clearHideTimer = createReaderChromeHideTimerClearAction(context)
  const startHideTimer = createReaderChromeHideTimerStartAction(context, clearHideTimer)

  return {
    clearHideTimer,
    startHideTimer,
  }
}
