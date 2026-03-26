export type ReaderToolbarPanelsEmits = {
  back: []
  toggleCatalog: []
  toggleFullscreen: []
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

export type ReaderToolbarPanelsEmitFn =
  <EventName extends keyof ReaderToolbarPanelsEmits>(
    event: EventName,
    ...args: ReaderToolbarPanelsEmits[EventName]
  ) => void
