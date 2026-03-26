import {
  createReaderDecodeCurrentChapterAction,
} from './decoder-current-chapter-action'
import type { ReaderDecoderDecodeActions } from './decoder-decode-action-types'
import type { ReaderDecoderActionRuntime } from './decoder-action-runtime-types'
import { createReaderToggleDecoderAction } from './decoder-toggle-action'

export function createReaderDecoderDecodeActions(
  runtime: ReaderDecoderActionRuntime,
): ReaderDecoderDecodeActions {
  const decodeCurrentChapter = createReaderDecodeCurrentChapterAction(runtime)
  const handleToggleDecoder = createReaderToggleDecoderAction(
    runtime,
    decodeCurrentChapter,
  )

  return {
    decodeCurrentChapter,
    handleToggleDecoder,
  }
}
