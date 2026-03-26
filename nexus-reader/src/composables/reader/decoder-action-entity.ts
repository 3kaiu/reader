import {
  createReaderDecoderEntityClickAction,
} from './decoder-entity-click-action'
import {
  createReaderDecoderEntityConfirmAction,
} from './decoder-entity-confirm-action'
import {
  createReaderDecoderEntityCorrectAction,
} from './decoder-entity-correct-action'
import type {
  ReaderDecoderEntityActions,
} from './decoder-entity-action-types'
import type {
  ReaderDecoderActionRuntime,
} from './decoder-action-runtime-types'

export function createReaderDecoderEntityActions(
  runtime: ReaderDecoderActionRuntime,
  decodeCurrentChapter: () => Promise<void>,
): ReaderDecoderEntityActions {
  const handleEntityClick = createReaderDecoderEntityClickAction(runtime)
  const handleConfirmEntity = createReaderDecoderEntityConfirmAction(runtime)
  const handleCorrectEntity = createReaderDecoderEntityCorrectAction(
    runtime,
    decodeCurrentChapter,
  )

  return {
    handleEntityClick,
    handleConfirmEntity,
    handleCorrectEntity,
  }
}
