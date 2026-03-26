export type ReaderScrollLoadStateEmits = {
  loadNextChapter: []
  retryLoad: []
}

export type ReaderScrollLoadStateEmitFn =
  <EventName extends keyof ReaderScrollLoadStateEmits>(
    event: EventName,
    ...args: ReaderScrollLoadStateEmits[EventName]
  ) => void
