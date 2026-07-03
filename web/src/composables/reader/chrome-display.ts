import type { ReaderChromeActionContext } from './chrome-types'
import type { ReaderChromeDisplayActions } from './chrome-types'
import type { ReaderChromeLayerActions } from './chrome-types'
import type { ReaderChromeTimerActions } from './chrome-types'
import { createReaderChromePanelDisplayActions } from './chrome-panel-display'
import { createReaderChromeSystemDisplayActions } from './chrome-system-display'
import { createReaderChromeToolbarDisplayActions } from './chrome-toolbar-display'

export function createReaderChromeDisplayActions(
  context: ReaderChromeActionContext,
  timers: ReaderChromeTimerActions,
  layers: ReaderChromeLayerActions
): ReaderChromeDisplayActions {
  const toolbar = createReaderChromeToolbarDisplayActions(context, timers)
  const panels = createReaderChromePanelDisplayActions(context)
  const system = createReaderChromeSystemDisplayActions(context, layers)

  return {
    ...toolbar,
    ...panels,
    ...system,
  }
}
