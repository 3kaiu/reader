import type { ReaderChromeActionContext } from './chrome-context-types'

export function createReaderChromeHideTimerStartAction(
  context: ReaderChromeActionContext,
  clearHideTimer: () => void
) {
  return function startHideTimer() {
    clearHideTimer()
    context.state.hideToolbarTimer.value = setTimeout(() => {
      if (!context.state.showSettings.value && !context.state.showCatalog.value) {
        context.state.showToolbar.value = false
      }
    }, 4000)
  }
}
