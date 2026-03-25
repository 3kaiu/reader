import {
  createReaderDecoderDecodeActions,
} from './decoder-action-decode'
import {
  createReaderDecoderEntityActions,
} from './decoder-action-entity'
import {
  createReaderDecoderActionRuntime,
} from './decoder-action-runtime'
import type { ReaderDecoderActionOptions } from './decoder-action-types'

export type { ReaderDecoderActionOptions } from './decoder-action-types'

export function createReaderDecoderActions(
  options: ReaderDecoderActionOptions,
) {
  const runtime = createReaderDecoderActionRuntime(options)
  const { decodeCurrentChapter, handleToggleDecoder } =
    createReaderDecoderDecodeActions(runtime)
  const {
    handleEntityClick,
    handleConfirmEntity,
    handleCorrectEntity,
  } = createReaderDecoderEntityActions(runtime, decodeCurrentChapter)

  return {
    decodeCurrentChapter,
    handleToggleDecoder,
    handleEntityClick,
    handleConfirmEntity,
    handleCorrectEntity,
  }
}
