import { useReaderScrollSync } from '@/composables/useReaderScrollSync'
import type { ReaderViewServices } from './view-services'

export function setupReaderViewFeatureEffects(services: ReaderViewServices) {
  useReaderScrollSync({
    readerStore: services.readerStore,
    settingsStore: services.settingsStore,
  })
}
