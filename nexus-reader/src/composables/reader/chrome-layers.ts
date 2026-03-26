import type { ReaderChromeActionContext } from './chrome-context-types'
import type { ReaderChromeLayerActions } from './chrome-layer-action-types'
import {
  createReaderChromeDecoderLayerCloseAction,
} from './chrome-decoder-layer-close'
import {
  createReaderChromePanelLayerCloseAction,
} from './chrome-panel-layer-close'
import {
  createReaderChromeToolbarLayerCloseAction,
} from './chrome-toolbar-layer-close'

export function createReaderChromeLayerActions(
  context: ReaderChromeActionContext,
): ReaderChromeLayerActions {
  const closeDecoderLayer = createReaderChromeDecoderLayerCloseAction(context)
  const closePanelLayer = createReaderChromePanelLayerCloseAction(context)
  const closeToolbarLayer = createReaderChromeToolbarLayerCloseAction(context)

  const closeActiveLayer = () => {
    if (closeDecoderLayer()) {
      return true
    }

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
