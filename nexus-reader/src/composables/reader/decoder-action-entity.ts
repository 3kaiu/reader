import type { DecodedEntity } from '@/types/decoder'
import { resolveDecoderCardPosition } from './decoder-helpers'
import type { ReaderDecoderActionRuntime } from './decoder-action-runtime'

export function createReaderDecoderEntityActions(
  runtime: ReaderDecoderActionRuntime,
  decodeCurrentChapter: () => Promise<void>,
) {
  function handleEntityClick(entity: DecodedEntity, event: MouseEvent) {
    runtime.options.decoderStore.selectEntity(
      entity,
      resolveDecoderCardPosition(event),
    )
  }

  async function handleConfirmEntity(entity: DecodedEntity) {
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

  async function handleCorrectEntity(entity: DecodedEntity, newReal: string) {
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

  return {
    handleEntityClick,
    handleConfirmEntity,
    handleCorrectEntity,
  }
}
