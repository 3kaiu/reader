import type { DecodedEntity } from '@/types/decoder'
import type { ReaderLoadedChapter } from './content-chapter-types'
import type { ReaderContentStyle } from './content-style-types'

export interface ReaderContentProps {
  contentStyle: ReaderContentStyle
  loadedChapters: ReaderLoadedChapter[]
  isParsing: boolean
  isLoadingMore: boolean
  hasNextChapter: boolean
  isFullscreen: boolean
  formattedTime: string
  paragraphSpacing: number
  loadError?: string | null
  decoderEnabled?: boolean
  decoderEntities?: DecodedEntity[]
}
