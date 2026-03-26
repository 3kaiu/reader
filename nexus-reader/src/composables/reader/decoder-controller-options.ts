import type { useDecoder } from '@/composables/useDecoder'
import type { ReaderDecoderActionOptions } from './decoder-action-option-types'
import type { UseReaderDecoderOptions } from './decoder-controller-option-types'
import type { ReaderToast } from './shared-types'

export function createReaderDecoderControllerOptions(
  options: UseReaderDecoderOptions,
  dependencies: {
    decoder: ReturnType<typeof useDecoder>
    toast: ReaderToast
  },
): ReaderDecoderActionOptions {
  return {
    activeBookUrl: options.activeBookUrl,
    enabled: options.enabled,
    readerStore: options.readerStore,
    decoderStore: options.decoderStore,
    decoder: dependencies.decoder,
    toast: dependencies.toast,
  }
}
