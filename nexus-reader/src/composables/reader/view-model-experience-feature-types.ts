import type { ReaderViewActionFeature } from './view-action-feature-types'
import type { ReaderViewChromeFeature } from './view-chrome-feature-types'
import type { ReaderViewDecoderFeature } from './view-decoder-feature-types'
import type { ReaderViewSessionFeature } from './view-session-feature-types'

export interface ReaderExperienceModelFeatures {
  session: ReaderViewSessionFeature
  chrome: ReaderViewChromeFeature
  actions: ReaderViewActionFeature
  decoder: ReaderViewDecoderFeature
}
