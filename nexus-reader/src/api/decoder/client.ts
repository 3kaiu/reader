import { ofetch } from 'ofetch'
import { getAuthToken } from '@/utils/authStorage'

const DECODER_URL =
  import.meta.env.VITE_DECODER_URL || 'https://nexus-decoder.cinosci.workers.dev'

export const decoderFetch = ofetch.create({
  baseURL: DECODER_URL,
  timeout: 30000,
  credentials: 'include',
  retry: 2,
  retryDelay: 1000,
  onRequest({ options }) {
    const token = getAuthToken()
    if (!token) {
      return
    }

    const headers = new Headers(options.headers as HeadersInit)
    headers.set('Authorization', `Bearer ${token}`)
    options.headers = headers
  },
})
