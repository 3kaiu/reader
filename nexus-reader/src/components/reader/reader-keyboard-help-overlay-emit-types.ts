export type ReaderKeyboardHelpOverlayEmits = {
  'update:open': [value: boolean]
}

export type ReaderKeyboardHelpOverlayEmitFn =
  <EventName extends keyof ReaderKeyboardHelpOverlayEmits>(
    event: EventName,
    ...args: ReaderKeyboardHelpOverlayEmits[EventName]
  ) => void
