import type { DecodedEntity } from '@/types/decoder'
import type {
  ReaderDecoderActionRuntime,
} from './decoder-action-runtime-types'

export function createReaderDecoderEntityConfirmAction(
  runtime: ReaderDecoderActionRuntime,
) {
  return async function handleConfirmEntity(entity: DecodedEntity) {
    const bookUrl = runtime.getActiveBookUrl()
    if (!bookUrl) return

    const success = await runtime.options.decoder.confirmEntity(
      entity,
      bookUrl,
      runtime.getCurrentBookType(),
    )

    if (!success) {
      return
    }

    runtime.options.decoderStore.closeCard()
    runtime.options.toast({ title: '已确认' })
  }
}
