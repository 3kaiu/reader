import { createDecoderDecodeActions } from './decode'
import { createDecoderDictionaryActions } from './dictionary'
import { createDecoderEntityActions } from './entity'
import type { DecoderActionErrorState } from './types'

export function createDecoderActions(error: DecoderActionErrorState) {
  return {
    ...createDecoderDecodeActions(error),
    ...createDecoderDictionaryActions(error),
    ...createDecoderEntityActions(error),
  }
}
