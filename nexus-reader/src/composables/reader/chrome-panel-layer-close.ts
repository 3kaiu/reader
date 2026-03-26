import type { ReaderChromeActionContext } from './chrome-context-types'

export function createReaderChromePanelLayerCloseAction(
  context: ReaderChromeActionContext,
) {
  return function closePanelLayer() {
    if (context.state.showDecoderSettings.value) {
      context.state.showDecoderSettings.value = false
      return true
    }

    if (context.state.showKeyboardHelp.value) {
      context.state.showKeyboardHelp.value = false
      return true
    }

    if (context.state.showBookInfo.value) {
      context.state.showBookInfo.value = false
      return true
    }

    if (context.state.showSourcePicker.value) {
      context.state.showSourcePicker.value = false
      return true
    }

    if (context.state.showSettings.value) {
      context.state.showSettings.value = false
      return true
    }

    if (context.state.showCatalog.value) {
      context.state.showCatalog.value = false
      return true
    }

    return false
  }
}
