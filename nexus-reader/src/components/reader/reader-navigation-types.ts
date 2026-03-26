export interface ReaderNavigationProps {
  currentChapterIndex: number
  totalChapters: number
  hasPrevChapter: boolean
  hasNextChapter: boolean
}

export type ReaderNavigationEmits = {
  prev: []
  next: []
}

export type ReaderNavigationEmitFn =
  <EventName extends keyof ReaderNavigationEmits>(
    event: EventName,
    ...args: ReaderNavigationEmits[EventName]
  ) => void
