/**
 * Reader Chrome: hide-timer management
 *
 * Merged from chrome-hide-timer-clear.ts + chrome-hide-timer-start.ts
 */
import type { ReaderChromeActionContext } from './chrome-types'
import type { ReaderChromeTimerActions } from './chrome-types'

export function createReaderChromeHideTimerActions(
  context: ReaderChromeActionContext
): ReaderChromeTimerActions {
  function clearHideTimer() {
    if (context.state.hideToolbarTimer.value) {
      clearTimeout(context.state.hideToolbarTimer.value)
      context.state.hideToolbarTimer.value = null
    }
  }

  function startHideTimer() {
    clearHideTimer()
    context.state.hideToolbarTimer.value = setTimeout(() => {
      if (!context.state.showSettings.value && !context.state.showCatalog.value) {
        context.state.showToolbar.value = false
      }
    }, 4000)
  }

  return {
    clearHideTimer,
    startHideTimer,
  }
}
