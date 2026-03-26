import { useReaderDecoder } from '@/composables/useReaderDecoder'
import { createReaderDecoderFeatureOptions } from './view-feature-decoder-options'
import type {
  ReaderViewLayout,
  ReaderViewServices,
} from './view-dependencies'
import type { ReaderViewDecoderFeature } from './view-decoder-feature-types'
import type { ReaderViewSessionFeature } from './view-session-feature-types'

export function createReaderViewDecoderFeature(
  services: ReaderViewServices,
  layout: ReaderViewLayout,
  session: ReaderViewSessionFeature,
): ReaderViewDecoderFeature {
  return useReaderDecoder(
    createReaderDecoderFeatureOptions(services, session, layout),
  )
}
