export type ReaderNavigationContentEmits = {
  prev: []
  next: []
}

export type ReaderNavigationContentEmitFn = <EventName extends keyof ReaderNavigationContentEmits>(
  event: EventName,
  ...args: ReaderNavigationContentEmits[EventName]
) => void
