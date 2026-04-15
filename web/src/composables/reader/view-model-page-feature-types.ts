import type { ReaderViewFeatures } from './view-feature-types'

export interface ReaderPageModelFeatures {
  chrome: ReaderViewFeatures['chrome']
  actions: ReaderViewFeatures['actions']
}
