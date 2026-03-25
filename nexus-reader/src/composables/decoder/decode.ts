import { decodeChapter as apiDecodeChapter } from '@/api/decoder'
import type { DecodeResponse } from '@/types/decoder'
import type {
  DecoderActionErrorState,
  DecoderBookMeta,
} from './types'

export function createDecoderDecodeActions(error: DecoderActionErrorState) {
  const decodeChapter = async (
    bookId: string,
    chapterId: string,
    content: string,
    meta?: DecoderBookMeta,
  ): Promise<DecodeResponse | null> => {
    if (!bookId || !chapterId || !content) {
      error.value = '缺少解码所需参数'
      return null
    }

    try {
      error.value = null
      return await apiDecodeChapter({
        bookId,
        chapterId,
        content,
        bookMeta: meta?.type
          ? {
              type: meta.type,
              tags: meta.tags,
              era: meta.era,
            }
          : undefined,
      })
    } catch (err) {
      error.value = err instanceof Error ? err.message : '解码失败'
      return null
    }
  }

  return {
    decodeChapter,
  }
}
