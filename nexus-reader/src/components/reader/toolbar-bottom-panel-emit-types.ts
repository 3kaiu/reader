export type ReaderToolbarBottomPanelEmits = {
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

export type ReaderToolbarBottomPanelEmitFn =
  <EventName extends keyof ReaderToolbarBottomPanelEmits>(
    event: EventName,
    ...args: ReaderToolbarBottomPanelEmits[EventName]
  ) => void
