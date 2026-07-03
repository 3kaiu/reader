import type { ReaderChromeActionContext } from './chrome-types'

export function createReaderChromeHideTimerClearAction(context: ReaderChromeActionContext) {
  return function clearHideTimer() {
    if (context.state.hideToolbarTimer.value) {
      clearTimeout(context.state.hideToolbarTimer.value)
      context.state.hideToolbarTimer.value = null
    }
  }
}
