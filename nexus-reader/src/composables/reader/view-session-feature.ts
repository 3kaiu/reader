import { useReaderSession } from '@/composables/useReaderSession'
import { createReaderSessionFeatureOptions } from './view-feature-session-options'
import type {
  ReaderViewLayout,
  ReaderViewServices,
} from './view-dependencies'
import type { ReaderViewSessionFeature } from './view-session-feature-types'

export function createReaderViewSessionFeature(
  services: ReaderViewServices,
  _layout: ReaderViewLayout,
): ReaderViewSessionFeature {
  return useReaderSession(createReaderSessionFeatureOptions(services))
}
