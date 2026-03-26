import type { ReaderViewActionFeature } from './view-action-feature-types'
import type { ReaderViewChromeFeature } from './view-chrome-feature-types'

export interface ReaderPageModelFeatures {
  chrome: ReaderViewChromeFeature
  actions: ReaderViewActionFeature
}
