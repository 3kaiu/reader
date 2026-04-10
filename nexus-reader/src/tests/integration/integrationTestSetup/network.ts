import { vi } from 'vitest'

export async function setupNetworkMocks(
  mocks: Map<string, unknown>,
  cleanup: Array<() => Promise<void>>
): Promise<void> {
  console.log('🌐 Setting up network mocks...')

  const originalFetch = global.fetch
  const mockFetch = vi.fn()

  mockFetch.mockImplementation((url: RequestInfo | URL, _options?: RequestInit) => {
    const urlStr = url.toString()

    if (urlStr.includes('/analytics')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: { events: [], metrics: {} },
          }),
          { status: 200 }
        )
      )
    }

    if (urlStr.includes('/health')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            status: 'healthy',
            services: { all: 'operational' },
          }),
          { status: 200 }
        )
      )
    }

    if (urlStr.includes('/storage')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            usage: { total: 1000, used: 100, available: 900 },
          }),
          { status: 200 }
        )
      )
    }

    return Promise.resolve(
      new Response(
        JSON.stringify({
          error: 'Not mocked',
        }),
        { status: 404 }
      )
    )
  })

  global.fetch = mockFetch
  mocks.set('fetch', { original: originalFetch, mock: mockFetch })

  cleanup.push(async () => {
    global.fetch = originalFetch
  })

  console.log('✅ Network mocks setup complete')
}
