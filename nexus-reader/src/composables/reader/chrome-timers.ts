import type { ReaderChromeActionContext } from './chrome-context-types'
import type { ReaderChromeTimerActions } from './chrome-display-types'

export function createReaderChromeTimerActions(
  context: ReaderChromeActionContext,
): ReaderChromeTimerActions {
  const clearHideTimer = () => {
    if (context.state.hideToolbarTimer.value) {
      clearTimeout(context.state.hideToolbarTimer.value)
      context.state.hideToolbarTimer.value = null
    }
  }

  const startHideTimer = () => {
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
