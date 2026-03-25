import { useReaderActions } from '@/composables/useReaderActions'
import { useReaderChrome } from '@/composables/useReaderChrome'
import { useReaderDecoder } from '@/composables/useReaderDecoder'
import { useReaderSession } from '@/composables/useReaderSession'
import { setupReaderViewFeatureEffects } from './view-feature-effects'
import { createReaderActionFeatureOptions } from './view-feature-action-options'
import { createReaderChromeFeatureOptions } from './view-feature-chrome-options'
import { createReaderDecoderFeatureOptions } from './view-feature-decoder-options'
import { createReaderSessionFeatureOptions } from './view-feature-session-options'
import type {
  ReaderViewLayout,
  ReaderViewServices,
} from './view-dependencies'

export function createReaderViewFeatures(
  services: ReaderViewServices,
  layout: ReaderViewLayout,
) {
  const session = useReaderSession(createReaderSessionFeatureOptions(services))

  const chrome = useReaderChrome(createReaderChromeFeatureOptions(services))

  const actions = useReaderActions(createReaderActionFeatureOptions(services))

  const decoder = useReaderDecoder(
    createReaderDecoderFeatureOptions(services, session, layout),
  )

  setupReaderViewFeatureEffects(services)

  return {
    session,
    chrome,
    actions,
    decoder,
  }
}

export type ReaderViewFeatures = ReturnType<typeof createReaderViewFeatures>
