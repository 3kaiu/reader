import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest'
import { resetAllMocks } from './mockFactory'

export function setupTestLifecycle() {
  beforeAll(() => {
    vi.useFakeTimers()
  })

  afterAll(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  beforeEach(() => {
    resetAllMocks()
  })

  afterEach(() => {
    // cleanup per test
  })
}
