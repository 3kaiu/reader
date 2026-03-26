import type { ReaderChromeActionContext } from './chrome-context-types'
import type {
  ReaderChromeDisplayActions,
} from './chrome-display-action-types'
import type { ReaderChromeLayerActions } from './chrome-layer-action-types'
import {
  createReaderChromeEscapeDisplayAction,
} from './chrome-escape-display'
import {
  createReaderChromeGoBackDisplayAction,
} from './chrome-go-back-display'

export function createReaderChromeSystemDisplayActions(
  context: ReaderChromeActionContext,
  layers: ReaderChromeLayerActions,
): Pick<ReaderChromeDisplayActions, 'goBack' | 'handleEscape'> {
  const { goBack } = createReaderChromeGoBackDisplayAction(context)
  const { handleEscape } = createReaderChromeEscapeDisplayAction(
    layers,
    goBack,
  )

  return {
    goBack,
    handleEscape,
  }
}
