import { decoderFetch } from './client'
import { DECODER_ROUTES } from './routes'
import type { DecoderHealthResponse } from './types'

export async function checkDecoderHealth(): Promise<DecoderHealthResponse> {
  return decoderFetch<DecoderHealthResponse>(DECODER_ROUTES.health, {
    method: 'GET',
  })
}
