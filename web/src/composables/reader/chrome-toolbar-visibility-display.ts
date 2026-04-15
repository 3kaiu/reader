import type { ReaderChromeActionContext } from './chrome-context-types'
import type { ReaderChromeDisplayActions } from './chrome-display-action-types'
import type { ReaderChromeTimerActions } from './chrome-timer-action-types'

export function createReaderChromeToolbarVisibilityDisplayActions(
  context: ReaderChromeActionContext,
  timers: ReaderChromeTimerActions
): Pick<ReaderChromeDisplayActions, 'toggleToolbar'> {
  const toggleToolbar = () => {
    if (context.options.settingsStore.config.zenMode) {
      return
    }

    context.state.showToolbar.value = !context.state.showToolbar.value
    if (context.state.showToolbar.value) {
      timers.startHideTimer()
    }
  }

  return {
    toggleToolbar,
  }
}
