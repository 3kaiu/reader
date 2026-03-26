import type { ReaderChromeActionContext } from './chrome-context-types'

export function createReaderChromeDecoderLayerCloseAction(
  context: ReaderChromeActionContext,
) {
  return function closeDecoderLayer() {
    if (
      context.options.decoderAddonEnabled &&
      context.options.decoderStore.showCard
    ) {
      context.options.decoderStore.closeCard()
      return true
    }

    return false
  }
}
