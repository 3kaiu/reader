import type { ReaderChromeActionContext } from './chrome-types'

export function createReaderChromeToolbarLayerCloseAction(context: ReaderChromeActionContext) {
  return function closeToolbarLayer() {
    if (context.state.showToolbar.value) {
      context.state.showToolbar.value = false
      return true
    }

    return false
  }
}
