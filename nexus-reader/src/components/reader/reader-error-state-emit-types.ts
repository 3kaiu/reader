export type ReaderErrorStateEmits = {
  openSourcePicker: []
  retryLoad: []
}

export type ReaderErrorStateEmitFn =
  <EventName extends keyof ReaderErrorStateEmits>(
    event: EventName,
    ...args: ReaderErrorStateEmits[EventName]
  ) => void
