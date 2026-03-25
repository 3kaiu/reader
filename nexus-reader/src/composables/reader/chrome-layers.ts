import type { ReaderChromeActionContext } from './chrome-context-types'
import type { ReaderChromeLayerActions } from './chrome-display-types'

export function createReaderChromeLayerActions(
  context: ReaderChromeActionContext,
): ReaderChromeLayerActions {
  const closeActiveLayer = () => {
    if (context.options.decoderAddonEnabled && context.options.decoderStore.showCard) {
      context.options.decoderStore.closeCard()
      return true
    }

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

    if (context.state.showToolbar.value) {
      context.state.showToolbar.value = false
      return true
    }

    return false
  }

  return {
    closeActiveLayer,
  }
}
