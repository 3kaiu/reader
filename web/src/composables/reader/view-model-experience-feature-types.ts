import type { ReaderViewFeatures } from './view-feature-types'

export interface ReaderExperienceModelFeatures {
  session: ReaderViewFeatures['session']
  chrome: ReaderViewFeatures['chrome']
  actions: ReaderViewFeatures['actions']
}
