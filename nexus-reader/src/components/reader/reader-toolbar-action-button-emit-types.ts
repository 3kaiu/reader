export type ReaderToolbarActionButtonEmits = {
  click: []
  contextmenu: [event: MouseEvent]
}

export type ReaderToolbarActionButtonEmitFn = <
  EventName extends keyof ReaderToolbarActionButtonEmits,
>(
  event: EventName,
  ...args: ReaderToolbarActionButtonEmits[EventName]
) => void
