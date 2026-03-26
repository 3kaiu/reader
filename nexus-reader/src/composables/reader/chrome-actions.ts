import { createReaderChromeDisplayActions } from './chrome-display'
import { createReaderChromeLayerActions } from './chrome-layers'
import { createReaderChromeTimerActions } from './chrome-timers'
import type { ReaderChromeActionsResult } from './chrome-actions-result-types'
import type { ReaderChromeActionOptions } from './chrome-option-types'
import type { ReaderChromeState } from './chrome-state'

export function createReaderChromeActions(
  state: ReaderChromeState,
  options: ReaderChromeActionOptions,
): ReaderChromeActionsResult {
  const context = { state, options }
  const timers = createReaderChromeTimerActions(context)
  const layers = createReaderChromeLayerActions(context)
  const display = createReaderChromeDisplayActions(context, timers, layers)

  return {
    clearHideTimer: timers.clearHideTimer,
    ...display,
  }
}
