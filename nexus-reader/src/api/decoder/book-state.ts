import type { BookState } from '@/types/decoder'
import { decoderFetch } from './client'
import { DECODER_ROUTES } from './routes'
import type { UpdateBookStatePayload } from './types'

export async function getBookState(bookId: string): Promise<BookState> {
  return decoderFetch<BookState>(DECODER_ROUTES.bookState(bookId), {
    method: 'GET',
  })
}

export async function updateBookState(
  bookId: string,
  data: UpdateBookStatePayload,
): Promise<BookState> {
  return decoderFetch<BookState>(DECODER_ROUTES.bookState(bookId), {
    method: 'PUT',
    body: data,
  })
}
