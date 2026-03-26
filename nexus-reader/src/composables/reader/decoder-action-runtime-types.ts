import type { ReaderDecoderActionOptions } from './decoder-action-option-types'

export interface ReaderDecoderActionRuntime {
  options: ReaderDecoderActionOptions
  getActiveBookUrl(): string
  getCurrentBookType(): ReaderDecoderActionOptions['decoderStore']['currentSettings']['bookType']
}
