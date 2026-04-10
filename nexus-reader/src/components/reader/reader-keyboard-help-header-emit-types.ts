export type ReaderKeyboardHelpHeaderEmits = {
  close: []
}

export type ReaderKeyboardHelpHeaderEmitFn = <
  EventName extends keyof ReaderKeyboardHelpHeaderEmits,
>(
  event: EventName,
  ...args: ReaderKeyboardHelpHeaderEmits[EventName]
) => void
