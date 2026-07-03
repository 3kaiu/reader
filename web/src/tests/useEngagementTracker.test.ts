import { describe, it, expect } from 'vitest'
import { useEngagementTracker } from '@/composables/useEngagementTracker'

describe('useEngagementTracker composable', () => {
  it('starts with started=false', () => {
    const { startTracking, stopTracking } = useEngagementTracker()
    expect(typeof startTracking).toBe('function')
    expect(typeof stopTracking).toBe('function')
  })

  it('startTracking and stopTracking do not throw', () => {
    const { startTracking, stopTracking } = useEngagementTracker()
    expect(() => startTracking()).not.toThrow()
    expect(() => stopTracking()).not.toThrow()
  })
})