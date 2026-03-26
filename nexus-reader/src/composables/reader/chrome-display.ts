import type { ReaderChromeActionContext } from './chrome-context-types'
import type {
  ReaderChromeDisplayActions,
} from './chrome-display-action-types'
import type { ReaderChromeLayerActions } from './chrome-layer-action-types'
import type { ReaderChromeTimerActions } from './chrome-timer-action-types'
import { createReaderChromePanelDisplayActions } from './chrome-panel-display'
import { createReaderChromeSystemDisplayActions } from './chrome-system-display'
import { createReaderChromeToolbarDisplayActions } from './chrome-toolbar-display'

export function createReaderChromeDisplayActions(
  context: ReaderChromeActionContext,
  timers: ReaderChromeTimerActions,
  layers: ReaderChromeLayerActions,
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
