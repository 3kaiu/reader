export type ReaderModalsEmits = {
  'update:showCatalog': [val: boolean]
  'update:showSettings': [val: boolean]
  'update:showSourcePicker': [val: boolean]
  'update:showBookInfo': [val: boolean]
  'update:showKeyboardHelp': [val: boolean]
  'select-chapter': [index: number]
  refresh: []
  'download-all': []
}

export type ReaderModalsEmitFn = <EventName extends keyof ReaderModalsEmits>(
  event: EventName,
  ...args: ReaderModalsEmits[EventName]
) => void
