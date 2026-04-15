import { describe, expect, it } from 'vitest'
import { attachRequestMetadata } from '@/api/http/transport/request'
import type { InternalApiFetchOptions } from '@/api/http/types'

describe('HTTP transport request id reuse', () => {
  it('keeps X-Request-ID stable across multiple attachRequestMetadata calls', () => {
    const options: InternalApiFetchOptions = { method: 'PUT' }
    attachRequestMetadata(options, '/api/content?url=https%3A%2F%2Fexample.com%2Fchapter-1')
    const first = (options.headers as Record<string, string>)['X-Request-ID']
    expect(typeof first).toBe('string')
    expect(first.length).toBeGreaterThan(10)

    attachRequestMetadata(options, '/api/content?url=https%3A%2F%2Fexample.com%2Fchapter-1')
    const second = (options.headers as Record<string, string>)['X-Request-ID']
    expect(second).toBe(first)

    // Simulate direct -> edge fallback / re-dispatch: URL changes, same request id.
    attachRequestMetadata(options, 'https://edge.example.com/api/content?url=https%3A%2F%2Fexample.com%2Fchapter-1')
    const third = (options.headers as Record<string, string>)['X-Request-ID']
    expect(third).toBe(first)
  })
})

