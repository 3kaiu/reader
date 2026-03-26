import type {
  ReaderDecoderActionRuntime,
} from './decoder-action-runtime-types'

export function createReaderToggleDecoderAction(
  runtime: ReaderDecoderActionRuntime,
  decodeCurrentChapter: () => Promise<void>,
) {
  return async function handleToggleDecoder(enabled: boolean) {
    if (!runtime.options.enabled) return

    const bookUrl = runtime.getActiveBookUrl()
    if (!bookUrl) return

    runtime.options.decoderStore.updateBookSettings(bookUrl, { enabled })

    if (enabled) {
      await decodeCurrentChapter()
    }
  }
}
