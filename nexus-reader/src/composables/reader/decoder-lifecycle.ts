import { watch } from 'vue'
import type { ReaderDecoderActionOptions } from './decoder-action-types'

export function setupReaderDecoderLifecycle(
  options: Pick<ReaderDecoderActionOptions, 'enabled' | 'readerStore' | 'decoderStore'>,
  actions: {
    decodeCurrentChapter: () => Promise<void>
  },
) {
  watch(
    () => options.readerStore.currentChapterIndex,
    async () => {
      if (options.enabled && options.decoderStore.isEnabled) {
        await actions.decodeCurrentChapter()
      }
    },
  )
}
