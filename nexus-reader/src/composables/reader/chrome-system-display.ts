import type { ReaderChromeActionContext } from './chrome-context-types'
import type {
  ReaderChromeDisplayActions,
  ReaderChromeLayerActions,
} from './chrome-display-types'

export function createReaderChromeSystemDisplayActions(
  context: ReaderChromeActionContext,
  layers: ReaderChromeLayerActions,
): Pick<ReaderChromeDisplayActions, 'goBack' | 'handleEscape'> {
  const goBack = () => {
    void context.options.router.push('/')
  }

  const handleEscape = () => {
    if (layers.closeActiveLayer()) {
      return
    }

    goBack()
  }

  return {
    goBack,
    handleEscape,
  }
}
