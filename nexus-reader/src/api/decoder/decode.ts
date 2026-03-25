import { decoderFetch } from './client'
import { DECODER_ROUTES } from './routes'
import type { DecodeRequest, DecodeResponse } from './types'

export async function decodeChapter(request: DecodeRequest): Promise<DecodeResponse> {
  return decoderFetch<DecodeResponse>(DECODER_ROUTES.decode, {
    method: 'POST',
    body: request,
  })
}
