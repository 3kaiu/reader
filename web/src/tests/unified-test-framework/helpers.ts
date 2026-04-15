import * as fc from 'fast-check'
import type { PerformanceWithMemory } from './types'

export function getMockMethod<TResult = unknown>(
  mock: Record<string, unknown>,
  methodName: string
): (...args: unknown[]) => Promise<TResult> {
  const method = mock[methodName]

  if (typeof method !== 'function') {
    throw new Error(`Mock method ${methodName} is not defined`)
  }

  return (...args: unknown[]) => Promise.resolve(method(...args) as TResult)
}

export function getUsedHeapSize(): number {
  return (performance as PerformanceWithMemory).memory?.usedJSHeapSize || 0
}

export function createTestData<T>(generator: fc.Arbitrary<T>, count = 10): T[] {
  return fc.sample(generator, count)
}
