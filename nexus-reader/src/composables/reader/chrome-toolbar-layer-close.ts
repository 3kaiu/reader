import type { ReaderChromeActionContext } from './chrome-context-types'

export function createReaderChromeToolbarLayerCloseAction(
  context: ReaderChromeActionContext,
) {
  return function closeToolbarLayer() {
    if (context.state.showToolbar.value) {
      context.state.showToolbar.value = false
      return true
    }

    return false
  }
}
