import { vi } from 'vitest'
import type { MockApi, MockMethods } from './types'

export class MockFactory {
  private mocks: Map<string, MockApi> = new Map()

  createApiMock(apiName: string, methods: MockMethods): MockApi {
    const mock = vi.fn() as MockApi
    Object.assign(mock, methods)
    this.mocks.set(apiName, mock)

    Object.entries(methods).forEach(([method, implementation]) => {
      if (typeof implementation === 'function') {
        mock[method] = vi
          .fn()
          .mockImplementation((...args: unknown[]) =>
            Promise.resolve(
              (implementation as (...callArgs: unknown[]) => unknown | Promise<unknown>)(...args)
            )
          )
      }
    })

    return mock
  }

  createStorageMock() {
    return {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    }
  }

  createNetworkMock() {
    return {
      fetch: vi.fn(),
      onLine: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
  }

  resetAll() {
    this.mocks.forEach(mock => {
      if (typeof mock.mockReset === 'function') {
        mock.mockReset()
      }
    })
    vi.clearAllMocks()
  }

  getMock(name: string): MockApi | undefined {
    return this.mocks.get(name)
  }
}

export const globalMockFactory = new MockFactory()

export function setupApiMocks(apiName: string, methods: MockMethods) {
  return globalMockFactory.createApiMock(apiName, methods)
}

export function resetAllMocks() {
  globalMockFactory.resetAll()
}
