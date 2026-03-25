import type { Ref } from 'vue'
import { createReaderDecoderController } from '@/composables/reader/decoder-use'
import { useDecoderStore } from '@/stores/decoder'
import { useReaderStore } from '@/stores/reader'

export function useReaderDecoder(options: {
  activeBookUrl: Ref<string>
  enabled: boolean
}) {
  const readerStore = useReaderStore()
  const decoderStore = useDecoderStore()

  return createReaderDecoderController({
    activeBookUrl: options.activeBookUrl,
    enabled: options.enabled,
    readerStore,
    decoderStore,
  })
}
