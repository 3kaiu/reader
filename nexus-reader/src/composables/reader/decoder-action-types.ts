import type { Ref } from 'vue'
import type { useDecoder } from '@/composables/useDecoder'
import type { useDecoderStore } from '@/stores/decoder'
import type { useReaderStore } from '@/stores/reader'
import type { ReaderToast } from './types'

export type ReaderDecoderActionOptions = {
  activeBookUrl: Ref<string>
  enabled: boolean
  readerStore: ReturnType<typeof useReaderStore>
  decoderStore: ReturnType<typeof useDecoderStore>
  decoder: ReturnType<typeof useDecoder>
  toast: ReaderToast
}
