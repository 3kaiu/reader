import type { ReaderDecoderActionOptions } from './decoder-action-option-types'
import type {
  ReaderDecoderActionRuntime,
} from './decoder-action-runtime-types'

export function createReaderDecoderActionRuntime(
  options: ReaderDecoderActionOptions,
): ReaderDecoderActionRuntime {
  function getActiveBookUrl() {
    return options.activeBookUrl.value
  }

  function getCurrentBookType() {
    return options.decoderStore.currentSettings.bookType
  }

  return {
    options,
    getActiveBookUrl,
    getCurrentBookType,
  }
}
