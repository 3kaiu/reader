import type { useReaderActions } from '@/composables/useReaderActions'
import type { useReaderChrome } from '@/composables/useReaderChrome'
import type { useReaderSession } from '@/composables/useReaderSession'

export type ReaderViewActionFeature = ReturnType<typeof useReaderActions>
export type ReaderViewChromeFeature = ReturnType<typeof useReaderChrome>
export type ReaderViewSessionFeature = ReturnType<typeof useReaderSession>

export interface ReaderViewFeatures {
  session: ReaderViewSessionFeature
  chrome: ReaderViewChromeFeature
  actions: ReaderViewActionFeature
}
