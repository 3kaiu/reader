import type { ReaderChromeActionContext } from './chrome-context-types'
import type {
  ReaderChromeDisplayActions,
} from './chrome-display-action-types'
import type { ReaderChromeTimerActions } from './chrome-timer-action-types'
import {
  createReaderChromeToolbarVisibilityDisplayActions,
} from './chrome-toolbar-visibility-display'
import {
  createReaderChromeZenModeDisplayActions,
} from './chrome-zen-mode-display'

export function createReaderChromeToolbarDisplayActions(
  context: ReaderChromeActionContext,
  timers: ReaderChromeTimerActions,
): Pick<ReaderChromeDisplayActions, 'toggleToolbar' | 'toggleZenMode'> {
  const visibility = createReaderChromeToolbarVisibilityDisplayActions(
    context,
    timers,
  )
  const zenMode = createReaderChromeZenModeDisplayActions(context)

  return {
    ...visibility,
    ...zenMode,
  }
}
