import type { ReaderDecoderActionsResult } from './decoder-action-result-types'

export type ReaderDecoderLifecycleActions =
  Pick<ReaderDecoderActionsResult, 'decodeCurrentChapter'>
