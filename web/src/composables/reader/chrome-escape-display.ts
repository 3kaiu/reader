import type { ReaderChromeDisplayActions } from './chrome-types'
import type { ReaderChromeLayerActions } from './chrome-types'

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
