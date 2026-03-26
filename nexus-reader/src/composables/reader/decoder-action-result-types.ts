import type {
  ReaderDecoderDecodeActions,
} from './decoder-decode-action-types'
import type {
  ReaderDecoderEntityActions,
} from './decoder-entity-action-types'

export interface ReaderDecoderActionsResult
  extends ReaderDecoderDecodeActions,
  ReaderDecoderEntityActions {}
