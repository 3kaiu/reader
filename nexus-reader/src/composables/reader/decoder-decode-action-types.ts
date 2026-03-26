export interface ReaderDecoderDecodeActions {
  decodeCurrentChapter(): Promise<void>
  handleToggleDecoder(enabled: boolean): Promise<void>
}
