import { $get, $post } from './client'
import type { Book, Chapter, ChapterContent } from '@/types/book'

export type { Book, Chapter, ChapterContent } from '@/types/book'

/** Mirrors `nexus-server` `BatchContentResponse` / `BatchContentResult`. */
export type BatchContentResult = {
  url: string
  content?: string | null
  error?: string | null
}

export type BatchContentResponse = {
  results: BatchContentResult[]
}

type ReaderContentRequest = {
  bookUrl?: string
  bookId?: string
  index?: number
  chunkSize?: number
}

function safeDecodeUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    return url
  }

  let decoded = url
  let lastValid = url
  let attempts = 0
  const maxAttempts = 5

  if (!decoded.includes('%')) {
    return decoded
  }

  while (attempts < maxAttempts && decoded.includes('%')) {
    try {
      const previous = decoded
      decoded = decodeURIComponent(decoded)

      if (decoded === previous) {
        break
      }

      try {
        const urlObj = new URL(decoded)
        if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') {
          lastValid = decoded
          if (decoded.includes('%')) {
            attempts++
            continue
          }
          return decoded
        }
      } catch {
        return lastValid
      }

      attempts++
    } catch {
      return lastValid
    }
  }

  try {
    new URL(decoded)
    return decoded
  } catch {
    return url
  }
}

function validateSourceAndUrl(source: string, url: string): string {
  if (!source || typeof source !== 'string' || source.trim().length === 0) {
    throw new Error('Source parameter is required and must be a non-empty string')
  }
  if (!url || typeof url !== 'string' || url.trim().length === 0) {
    throw new Error('URL parameter is required and must be a non-empty string')
  }

  return safeDecodeUrl(url)
}

export const readerApi = {
  getBookInfo: (source: string, url: string, requestId?: string) => {
    const decodedUrl = validateSourceAndUrl(source, url)

    try {
      const urlObj = new URL(decodedUrl)
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        throw new Error('URL must use http or https protocol')
      }
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error('Invalid URL format')
      }
      throw error
    }

    return $get<Book>('/book', {
      params: { source: source.trim(), url: decodedUrl },
      ...(requestId ? ({ _requestId: requestId } as any) : {}),
    })
  },
  getChapters: (source: string, url: string, requestId?: string) => {
    const decodedUrl = validateSourceAndUrl(source, url)
    return $get<Chapter[]>('/chapters', {
      params: { source: source.trim(), url: decodedUrl },
      ...(requestId ? ({ _requestId: requestId } as any) : {}),
    })
  },
  getContent: (source: string, url: string, request?: ReaderContentRequest & { requestId?: string }) => {
    const decodedUrl = validateSourceAndUrl(source, url)
    const requestId = request?.requestId
    return $get<ChapterContent>('/content', {
      params: {
        source: source.trim(),
        url: decodedUrl,
        ...(request?.bookUrl ? { bookUrl: request.bookUrl } : {}),
        ...(request?.bookId ? { book_id: request.bookId } : {}),
        ...(typeof request?.index === 'number' ? { index: request.index } : {}),
        ...(typeof request?.chunkSize === 'number' ? { chunk_size: request.chunkSize } : {}),
      },
      ...(requestId ? ({ _requestId: requestId } as any) : {}),
    })
  },

  /** Prefetch-only: same engine `content()` as GET /content, no book_id/chunk metadata. */
  batchContent: (source: string, urls: string[]) => {
    if (!source || typeof source !== 'string' || source.trim().length === 0) {
      throw new Error('Source parameter is required and must be a non-empty string')
    }
    const trimmed = source.trim()
    const decoded = urls.map(u => validateSourceAndUrl(trimmed, u))
    return $post<BatchContentResponse>('/batch/content', { source: trimmed, urls: decoded })
  },
}
