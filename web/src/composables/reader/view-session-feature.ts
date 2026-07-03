import { useReaderSession } from '@/composables/useReaderSession'
import type { ReaderViewFeatures } from './view-model-types'
import type { ReaderViewLayout } from './view-layout'
import type { ReaderViewServices } from './view-services'

export function createReaderViewSessionFeature(
  services: ReaderViewServices,
  _layout: ReaderViewLayout
): ReaderViewFeatures['session'] {
  return useReaderSession({
    toast: services.toast,
    readerStore: services.readerStore,
    settingsStore: services.settingsStore,
    offlineStore: services.offlineStore,
  })
}
