export type ReaderErrorStateEmits = {
  openSourcePicker: []
}

export type ReaderErrorStateEmitFn =
  <EventName extends keyof ReaderErrorStateEmits>(
    event: EventName,
    ...args: ReaderErrorStateEmits[EventName]
  ) => void
