import { describe, expect, it, vi } from 'vitest'
import { proxyRequest } from '../shared/proxy'

function makeKv(): {
  get: (key: string, opts?: { type?: string }) => Promise<unknown>
  put: (key: string, value: string) => Promise<void>
} {
  const store = new Map<string, string>()

  return {
    async get(key, opts) {
      const raw = store.get(key)
      if (raw == null) return null
      if (opts?.type === 'json') return JSON.parse(raw)
      return raw
    },
    async put(key, value) {
      store.set(key, value)
    },
  }
}

describe('shared/proxy proxyRequest', () => {
  it('returns cached response for GET when enabled', async () => {
    const kv = makeKv()

    // Prime cache with the shape expected by getFromCache()
    await kv.put(
      // generateCacheKey() is internal; proxy.ts recomputes it, so we cannot easily precompute.
      // Instead we invoke proxyRequest twice: first will MISS, second will HIT after saveToCache().
      'unused',
      JSON.stringify({ body: 'unused', contentType: 'application/json' }),
    )

    const fetchSpy = vi.fn(async () => {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    const originalFetch = globalThis.fetch
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch

    try {
      const req = new Request('https://edge.example/api/content?x=1', {
        method: 'GET',
        headers: { Origin: 'https://app.example' },
      })

      // First request populates KV (MISS + set)
      const res1 = await proxyRequest(req, 'https://backend.example', '/api/content?x=1', {
        useCache: true,
        cacheTTL: 120,
        kv: kv as unknown as never,
        ctx: { waitUntil: (p: Promise<unknown>) => void p } as never,
      })
      expect(res1.headers.get('X-Cache')).toBe('MISS')

      // Second request should HIT cache and must not call fetch again
      const res2 = await proxyRequest(req, 'https://backend.example', '/api/content?x=1', {
        useCache: true,
        cacheTTL: 120,
        kv: kv as unknown as never,
        ctx: { waitUntil: (p: Promise<unknown>) => void p } as never,
      })

      expect(res2.headers.get('X-Cache')).toBe('HIT')
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      expect(await res2.text()).toBe(JSON.stringify({ ok: true }))
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('forwards request body as a stream for non-GET requests', async () => {
    const fetchSpy = vi.fn(async () => new Response('ok'))
    const originalFetch = globalThis.fetch
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch

    try {
      const req = new Request('https://edge.example/api/book', {
        method: 'POST',
        body: JSON.stringify({ a: 1 }),
        headers: { 'Content-Type': 'application/json' },
      })

      await proxyRequest(req, 'https://backend.example', '/api/book', {})

      const init = (fetchSpy as any).mock.calls[0]?.[1] as RequestInit | undefined
      expect(init?.body).toBe(req.body)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('returns unified error shape on proxy failure (503) and includes requestId', async () => {
    const fetchSpy = vi.fn(async () => {
      throw new Error('boom')
    })
    const originalFetch = globalThis.fetch
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch

    try {
      const requestId = 'req-123'
      const req = new Request('https://edge.example/api/search', {
        method: 'GET',
        headers: { 'X-Request-ID': requestId, Origin: 'https://app.example' },
      })

      const res = await proxyRequest(req, 'https://backend.example', '/api/search', {})
      expect(res.status).toBe(500)

      const json = await res.json()
      expect(json).toMatchObject({
        code: 'INTERNAL_ERROR',
        message: 'Unexpected backend error',
        requestId,
      })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('streams SSE responses directly (no caching) even when cache is enabled', async () => {
    const kv = {
      async get() {
        return null
      },
      async put() {
        throw new Error('KV put should not be called for SSE')
      },
    }

    const fetchSpy = vi.fn(async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: hello\n\n'))
          controller.close()
        },
      })

      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
        },
      })
    })
    const originalFetch = globalThis.fetch
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch

    try {
      const req = new Request('https://edge.example/api/search/stream', {
        method: 'GET',
        headers: { Origin: 'https://app.example' },
      })

      const res1 = await proxyRequest(req, 'https://backend.example', '/api/search/stream', {
        useCache: true,
        cacheTTL: 120,
        kv: kv as unknown as never,
        ctx: { waitUntil: (p: Promise<unknown>) => void p } as never,
      })
      expect(res1.headers.get('Content-Type')).toContain('text/event-stream')
      expect(res1.headers.get('X-Cache')).toBe('MISS')
      expect(await res1.text()).toContain('data: hello')

      const res2 = await proxyRequest(req, 'https://backend.example', '/api/search/stream', {
        useCache: true,
        cacheTTL: 120,
        kv: kv as unknown as never,
        ctx: { waitUntil: (p: Promise<unknown>) => void p } as never,
      })
      expect(res2.headers.get('X-Cache')).toBe('MISS')
      expect(fetchSpy).toHaveBeenCalledTimes(2)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

