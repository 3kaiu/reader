import { useReaderChrome } from '@/composables/useReaderChrome'
import { createReaderChromeFeatureOptions } from './view-feature-chrome-options'
import type {
  ReaderViewLayout,
  ReaderViewServices,
} from './view-dependencies'
import type { ReaderViewChromeFeature } from './view-chrome-feature-types'

export function createReaderViewChromeFeature(
  services: ReaderViewServices,
  _layout: ReaderViewLayout,
): ReaderViewChromeFeature {
  return useReaderChrome(createReaderChromeFeatureOptions(services))
}
