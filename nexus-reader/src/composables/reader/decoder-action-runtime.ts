import type { ReaderDecoderActionOptions } from './decoder-action-types'

export function createReaderDecoderActionRuntime(
  options: ReaderDecoderActionOptions,
) {
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

export type ReaderDecoderActionRuntime = ReturnType<
  typeof createReaderDecoderActionRuntime
>
