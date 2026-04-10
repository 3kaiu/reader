import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as fc from 'fast-check'
import { ErrorCode, NexusError } from '@/utils/errors'
import { getMockMethod } from './helpers'
import { MockFactory } from './mockFactory'

export class PropertyTestFramework {
  static async testApiProperties(apiName: string, apiMethods: string[]) {
    describe(`${apiName} - Property Tests`, () => {
      const mockFactory = new MockFactory()

      beforeEach(() => {
        mockFactory.resetAll()
      })

      apiMethods.forEach(methodName => {
        it(`should handle ${methodName} with valid inputs`, async () => {
          await fc.assert(
            fc.asyncProperty(fc.string(), fc.record({}), async (input, params) => {
              const mockApi = mockFactory.createApiMock(apiName, {
                [methodName]: () => ({ success: true, data: input }),
              })

              const invoke = getMockMethod<{ success: boolean }>(mockApi, methodName)
              const result = await invoke(input, params)
              return result.success === true
            })
          )
        })

        it(`should handle ${methodName} errors gracefully`, async () => {
          await fc.assert(
            fc.asyncProperty(fc.string(), async input => {
              const mockApi = mockFactory.createApiMock(apiName, {
                [methodName]: () => {
                  throw new NexusError(ErrorCode.NETWORK_ERROR, 'Network error')
                },
              })

              try {
                const invoke = getMockMethod(mockApi, methodName)
                await invoke(input)
                return false
              } catch (error: unknown) {
                return error instanceof NexusError
              }
            })
          )
        })
      })
    })
  }

  static async testDataStructureProperties<T>(
    structureName: string,
    generator: fc.Arbitrary<T>,
    invariants: Array<(data: T) => boolean>
  ) {
    describe(`${structureName} - Data Structure Properties`, () => {
      it('should satisfy all invariants', async () => {
        await fc.assert(
          fc.property(generator, data => invariants.every(invariant => invariant(data)))
        )
      })
    })
  }

  static async testCacheProperties(cacheName: string) {
    describe(`${cacheName} - Cache Properties`, () => {
      const mockFactory = new MockFactory()

      it('should maintain LRU order', async () => {
        const cache = mockFactory.createApiMock(cacheName, {
          get: (key: string) => ({ found: true, value: `value_${key}` }),
          put: () => undefined,
        })

        const put = getMockMethod(cache, 'put')
        const get = getMockMethod<{ found: boolean }>(cache, 'get')

        await put('key1', 'value1')
        await put('key2', 'value2')
        await put('key3', 'value3')

        await get('key1')

        const result = await get('key2')
        expect(result.found).toBe(false)
      })

      it('should handle concurrent access', async () => {
        const cache = mockFactory.createApiMock(cacheName, {
          get: vi.fn().mockResolvedValue({ found: true }),
          put: vi.fn().mockResolvedValue(undefined),
        })

        const get = getMockMethod<{ found: boolean }>(cache, 'get')
        const promises = Array.from({ length: 10 }, (_, i) => get(`key${i}`))
        const results = await Promise.all(promises)

        expect(results).toHaveLength(10)
        results.forEach(result => {
          expect(result.found).toBe(true)
        })
      })
    })
  }
}
