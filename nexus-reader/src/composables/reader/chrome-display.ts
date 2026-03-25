import type { ReaderChromeActionContext } from './chrome-context-types'
import type {
  ReaderChromeDisplayActions,
  ReaderChromeLayerActions,
  ReaderChromeTimerActions,
} from './chrome-display-types'
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
