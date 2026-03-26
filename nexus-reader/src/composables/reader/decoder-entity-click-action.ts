import type { DecodedEntity } from '@/types/decoder'
import { resolveDecoderCardPosition } from './decoder-helpers'
import type {
  ReaderDecoderActionRuntime,
} from './decoder-action-runtime-types'

export function createReaderDecoderEntityClickAction(
  runtime: ReaderDecoderActionRuntime,
) {
  return function handleEntityClick(entity: DecodedEntity, event: MouseEvent) {
    runtime.options.decoderStore.selectEntity(
      entity,
      resolveDecoderCardPosition(event),
    )
  }
}
