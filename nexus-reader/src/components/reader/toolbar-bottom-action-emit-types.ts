export type ReaderToolbarBottomActionsEmits = {
  toggleDayNight: []
  toggleSettings: []
  toggleEyeCare: []
  toggleZenMode: []
  refresh: []
  openSourcePicker: []
  openBookInfo: []
}

export type ReaderToolbarBottomActionsEmitFn =
  <EventName extends keyof ReaderToolbarBottomActionsEmits>(
    event: EventName,
    ...args: ReaderToolbarBottomActionsEmits[EventName]
  ) => void
