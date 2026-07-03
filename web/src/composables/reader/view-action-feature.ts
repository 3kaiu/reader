import { useReaderActions } from '@/composables/useReaderActions'
import type { ReaderViewFeatures } from './view-model-types'
import type { ReaderViewLayout } from './view-layout'
import type { ReaderViewServices } from './view-services'

export function createReaderViewActionFeature(
  services: ReaderViewServices,
  _layout: ReaderViewLayout
): ReaderViewFeatures['actions'] {
  return useReaderActions({
    readerStore: services.readerStore,
    settingsStore: services.settingsStore,
    toast: services.toast,
  })
}
