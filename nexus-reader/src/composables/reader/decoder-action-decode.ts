import {
  hasDecodableReaderContent,
} from './decoder-helpers'
import type { ReaderDecoderActionRuntime } from './decoder-action-runtime'

export function createReaderDecoderDecodeActions(
  runtime: ReaderDecoderActionRuntime,
) {
  async function decodeCurrentChapter() {
    if (!runtime.options.enabled) return

    const bookUrl = runtime.getActiveBookUrl()
    const chapterUrl = runtime.options.readerStore.currentChapter?.url || ''
    const content = runtime.options.readerStore.content

    if (!hasDecodableReaderContent({ bookUrl, content })) {
      return
    }

    runtime.options.decoderStore.setDecoding(true)

    try {
      const result = await runtime.options.decoder.decodeChapter(
        bookUrl,
        chapterUrl,
        content,
        {
          type: runtime.getCurrentBookType(),
          tags: runtime.options.readerStore.currentBook?.tags,
        },
      )

      if (result) {
        runtime.options.decoderStore.setDecodeResult(
          result.entities,
          result.context,
        )
      } else {
        runtime.options.decoderStore.setDecodeError(
          runtime.options.decoder.error.value || '解码失败',
        )
      }
    } catch (error) {
      runtime.options.decoderStore.setDecodeError(
        error instanceof Error ? error.message : '解码失败',
      )
    }
  }

  async function handleToggleDecoder(enabled: boolean) {
    if (!runtime.options.enabled) return

    const bookUrl = runtime.getActiveBookUrl()
    if (!bookUrl) return

    runtime.options.decoderStore.updateBookSettings(bookUrl, { enabled })

    if (enabled) {
      await decodeCurrentChapter()
    }
  }

  return {
    decodeCurrentChapter,
    handleToggleDecoder,
  }
}
