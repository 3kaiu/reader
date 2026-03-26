import { useReaderActions } from '@/composables/useReaderActions'
import { createReaderActionFeatureOptions } from './view-feature-action-options'
import type {
  ReaderViewLayout,
  ReaderViewServices,
} from './view-dependencies'
import type { ReaderViewActionFeature } from './view-action-feature-types'

export function createReaderViewActionFeature(
  services: ReaderViewServices,
  _layout: ReaderViewLayout,
): ReaderViewActionFeature {
  return useReaderActions(createReaderActionFeatureOptions(services))
}
