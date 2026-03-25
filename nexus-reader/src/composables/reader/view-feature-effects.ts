import { useReaderScrollSync } from '@/composables/useReaderScrollSync'
import type { ReaderViewServices } from './view-dependencies'

export function setupReaderViewFeatureEffects(
  services: ReaderViewServices,
) {
  useReaderScrollSync({ readerStore: services.readerStore })
}
