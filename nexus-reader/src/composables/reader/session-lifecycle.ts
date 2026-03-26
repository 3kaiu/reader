import {
  setupReaderSessionDisposeLifecycle,
} from './session-dispose-lifecycle'
import {
  setupReaderSessionEngagementLifecycle,
} from './session-engagement-lifecycle'
import type {
  ReaderSessionLifecycleContext,
} from './session-lifecycle-context-types'
import { setupReaderSessionRouteLifecycle } from './session-route-lifecycle'

export function setupReaderSessionLifecycle(
  context: ReaderSessionLifecycleContext,
) {
  setupReaderSessionRouteLifecycle(context)
  setupReaderSessionEngagementLifecycle(context)
  setupReaderSessionDisposeLifecycle(context)
}
