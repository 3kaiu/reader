import { useReaderChrome } from '@/composables/useReaderChrome'
import type { ReaderViewFeatures } from './view-model-types'
import type { ReaderViewLayout } from './view-layout'
import type { ReaderViewServices } from './view-services'

export function createReaderViewChromeFeature(
  services: ReaderViewServices,
  _layout: ReaderViewLayout
): ReaderViewFeatures['chrome'] {
  return useReaderChrome({
    settingsStore: services.settingsStore,
    toast: services.toast,
  })
}
