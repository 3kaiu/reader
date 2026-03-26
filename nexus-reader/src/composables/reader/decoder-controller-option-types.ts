import type { ReaderDecoderActionOptions } from './decoder-action-option-types'

export type UseReaderDecoderOptions = Pick<
  ReaderDecoderActionOptions,
  'activeBookUrl' | 'enabled'
> & {
  readerStore: ReaderDecoderActionOptions['readerStore']
  decoderStore: ReaderDecoderActionOptions['decoderStore']
}
