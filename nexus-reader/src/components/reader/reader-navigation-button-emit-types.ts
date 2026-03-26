export type ReaderNavigationButtonEmits = {
  click: []
}

export type ReaderNavigationButtonEmitFn =
  <EventName extends keyof ReaderNavigationButtonEmits>(
    event: EventName,
    ...args: ReaderNavigationButtonEmits[EventName]
  ) => void
