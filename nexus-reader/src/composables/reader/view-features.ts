import { setupReaderViewFeatureEffects } from './view-feature-effects'
import { createReaderViewActionFeature } from './view-action-feature'
import { createReaderViewChromeFeature } from './view-chrome-feature'

import type {
  ReaderViewLayout,
  ReaderViewServices,
} from './view-dependencies'
import { createReaderViewSessionFeature } from './view-session-feature'
import type { ReaderViewFeatures } from './view-feature-types'

export type { ReaderViewFeatures } from './view-feature-types'

export function createReaderViewFeatures(
  services: ReaderViewServices,
  layout: ReaderViewLayout,
): ReaderViewFeatures {
  const session = createReaderViewSessionFeature(services, layout)
  const chrome = createReaderViewChromeFeature(services, layout)
  const actions = createReaderViewActionFeature(services, layout)

  setupReaderViewFeatureEffects(services)

  return {
    session,
    chrome,
    actions,
  }
}
