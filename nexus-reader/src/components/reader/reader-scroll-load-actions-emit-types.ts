export type ReaderScrollLoadActionsEmits = {
  loadNextChapter: []
  retryLoad: []
}

export type ReaderScrollLoadActionsEmitFn =
  <EventName extends keyof ReaderScrollLoadActionsEmits>(
    event: EventName,
    ...args: ReaderScrollLoadActionsEmits[EventName]
  ) => void
