import { useToast } from '@/components/ui/toast/use-toast'
import { useDecoder } from '@/composables/useDecoder'
import { createReaderDecoderActions } from './decoder-actions'
import {
  createReaderDecoderControllerOptions,
} from './decoder-controller-options'
import type {
  UseReaderDecoderOptions,
} from './decoder-controller-option-types'
import type {
  ReaderDecoderController,
} from './decoder-controller-types'
import { setupReaderDecoderLifecycle } from './decoder-lifecycle'
export type { UseReaderDecoderOptions } from './decoder-controller-option-types'
export type { ReaderDecoderController } from './decoder-controller-types'

export function createReaderDecoderController(
  options: UseReaderDecoderOptions,
): ReaderDecoderController {
  const { toast } = useToast()
  const decoder = useDecoder()
  const actions = createReaderDecoderActions(
    createReaderDecoderControllerOptions(options, {
      decoder,
      toast,
    }),
  )

  setupReaderDecoderLifecycle(options, actions)

  return actions
}
