export type ReaderToolbarBottomBarEmits = {
  toggleDayNight: []
  toggleSettings: []
  toggleEyeCare: []
  toggleZenMode: []
  refresh: []
  prevChapter: []
  nextChapter: []
  openSourcePicker: []
  openBookInfo: []
  toggleDecoder: [enabled: boolean]
  openDecoderSettings: []
}

export type ReaderToolbarBottomBarEmitFn =
  <EventName extends keyof ReaderToolbarBottomBarEmits>(
    event: EventName,
    ...args: ReaderToolbarBottomBarEmits[EventName]
  ) => void
