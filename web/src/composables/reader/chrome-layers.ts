import type { ReaderChromeActionContext } from './chrome-types'
import type { ReaderChromeLayerActions } from './chrome-types'
import { createReaderChromePanelLayerCloseAction } from './chrome-panel-layer-close'
import { createReaderChromeToolbarLayerCloseAction } from './chrome-toolbar-layer-close'

export function createReaderChromeLayerActions(
  context: ReaderChromeActionContext
): ReaderChromeLayerActions {
  const closePanelLayer = createReaderChromePanelLayerCloseAction(context)
  const closeToolbarLayer = createReaderChromeToolbarLayerCloseAction(context)

  const closeActiveLayer = () => {
    if (closePanelLayer()) {
      return true
    }

    if (closeToolbarLayer()) {
      return true
    }

    return false
  }

  return {
    closeActiveLayer,
  }
}
