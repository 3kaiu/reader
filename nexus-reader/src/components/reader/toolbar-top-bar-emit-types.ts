export type ReaderToolbarTopBarEmits = {
  back: []
  toggleCatalog: []
  toggleFullscreen: []
}

export type ReaderToolbarTopBarEmitFn =
  <EventName extends keyof ReaderToolbarTopBarEmits>(
    event: EventName,
    ...args: ReaderToolbarTopBarEmits[EventName]
  ) => void
