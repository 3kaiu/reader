import type { ReaderChromeDisplayActions } from './chrome-display-action-types'
import type { ReaderChromeLayerActions } from './chrome-layer-action-types'

export function createReaderChromeEscapeDisplayAction(
  layers: ReaderChromeLayerActions,
  goBack: () => void
): Pick<ReaderChromeDisplayActions, 'handleEscape'> {
  const handleEscape = () => {
    if (layers.closeActiveLayer()) {
      return
    }

    goBack()
  }

  return {
    handleEscape,
  }
}
