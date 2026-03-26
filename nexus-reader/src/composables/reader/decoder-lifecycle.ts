import { watch } from 'vue'
import type { ReaderDecoderActionOptions } from './decoder-action-option-types'
import type {
  ReaderDecoderLifecycleActions,
} from './decoder-lifecycle-action-types'

export function setupReaderDecoderLifecycle(
  options: Pick<ReaderDecoderActionOptions, 'enabled' | 'readerStore' | 'decoderStore'>,
  actions: ReaderDecoderLifecycleActions,
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
