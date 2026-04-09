export type ReaderKeyboardEmits = {
  'toggle-fullscreen': []
  'toggle-catalog': []
  'toggle-settings': []
  'toggle-day-night': []
  'toggle-help': []
  escape: []
}

export type ReaderKeyboardEmitFn =
  <EventName extends keyof ReaderKeyboardEmits>(
    event: EventName,
    ...args: ReaderKeyboardEmits[EventName]
  ) => void
