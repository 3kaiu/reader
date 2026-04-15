import { describe, expect, it } from 'vitest'
import { convertToNexusError } from '@/api/http/errors/normalize'

describe('request id propagation into NexusError', () => {
  it('uses requestId from backend payload when present', () => {
    const err = convertToNexusError(
      {
        status: 503,
        message: 'failed',
        response: {
          headers: new Headers({ 'X-Request-ID': 'hdr-1' }),
          _data: { code: 'SERVICE_UNAVAILABLE', message: 'x', requestId: 'payload-1' },
        },
      },
      '/api/search',
      'GET'
    )
    expect(err.requestId).toBe('payload-1')
  })

  it('falls back to X-Request-ID header when payload missing', () => {
    const err = convertToNexusError(
      {
        status: 500,
        message: 'failed',
        response: { headers: new Headers({ 'X-Request-ID': 'hdr-2' }), _data: { code: 'X', message: 'x' } },
      },
      '/api/search',
      'GET'
    )
    expect(err.requestId).toBe('hdr-2')
  })
})

