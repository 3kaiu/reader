import type { DecodedEntity } from '@/types/decoder'
import type {
  ReaderDecoderActionRuntime,
} from './decoder-action-runtime-types'

export function createReaderDecoderEntityCorrectAction(
  runtime: ReaderDecoderActionRuntime,
  decodeCurrentChapter: () => Promise<void>,
) {
  return async function handleCorrectEntity(
    entity: DecodedEntity,
    newReal: string,
  ) {
    const bookUrl = runtime.getActiveBookUrl()
    if (!bookUrl) return

    const success = await runtime.options.decoder.correctEntity(
      entity,
      newReal,
      bookUrl,
      runtime.getCurrentBookType(),
    )

    if (!success) {
      return
    }

    runtime.options.decoderStore.closeCard()
    runtime.options.toast({ title: '已纠正' })
    await decodeCurrentChapter()
  }
}
