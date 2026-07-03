import type { ReaderChromeActionContext } from './chrome-types'
import type { ReaderChromeDisplayActions } from './chrome-types'
import type { ReaderChromeLayerActions } from './chrome-types'
import { createReaderChromeEscapeDisplayAction } from './chrome-escape-display'
import { createReaderChromeGoBackDisplayAction } from './chrome-go-back-display'

export function createReaderChromeSystemDisplayActions(
  context: ReaderChromeActionContext,
  layers: ReaderChromeLayerActions
): Pick<ReaderChromeDisplayActions, 'goBack' | 'handleEscape'> {
  const { goBack } = createReaderChromeGoBackDisplayAction(context)
  const { handleEscape } = createReaderChromeEscapeDisplayAction(layers, goBack)

  return {
    goBack,
    handleEscape,
  }
}
