import { useToast } from '@/components/ui/toast/use-toast'
import { useDecoder } from '@/composables/useDecoder'
import { createReaderDecoderActions } from './decoder-actions'
import { setupReaderDecoderLifecycle } from './decoder-lifecycle'
import type { ReaderDecoderActionOptions } from './decoder-action-types'

export type UseReaderDecoderOptions = Pick<
  ReaderDecoderActionOptions,
  'activeBookUrl' | 'enabled'
> & {
  readerStore: ReaderDecoderActionOptions['readerStore']
  decoderStore: ReaderDecoderActionOptions['decoderStore']
}

export function createReaderDecoderController(
  options: UseReaderDecoderOptions,
) {
  const { toast } = useToast()
  const decoder = useDecoder()
  const actions = createReaderDecoderActions({
    activeBookUrl: options.activeBookUrl,
    enabled: options.enabled,
    readerStore: options.readerStore,
    decoderStore: options.decoderStore,
    decoder,
    toast,
  })

  setupReaderDecoderLifecycle(options, actions)

  return actions
}
