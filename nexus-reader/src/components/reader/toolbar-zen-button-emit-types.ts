export type ReaderToolbarZenButtonEmits = {
  exit: []
}

export type ReaderToolbarZenButtonEmitFn =
  <EventName extends keyof ReaderToolbarZenButtonEmits>(
    event: EventName,
    ...args: ReaderToolbarZenButtonEmits[EventName]
  ) => void
