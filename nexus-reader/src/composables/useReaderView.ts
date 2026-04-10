import {
  createReaderViewLayout,
  createReaderViewServices,
} from '@/composables/reader/view-dependencies'
import { createReaderViewFeatures } from '@/composables/reader/view-features'
import { createReaderViewModels } from '@/composables/reader/view-models'

export function useReaderView() {
  const services = createReaderViewServices()
  const layout = createReaderViewLayout()
  const features = createReaderViewFeatures(services, layout)
  const { readerPageState, readerPageActions, readerExperienceState, readerExperienceActions } =
    createReaderViewModels(services, layout, features)

  return {
    readerRef: layout.readerRef,
    readerPageState,
    readerPageActions,
    readerExperienceState,
    readerExperienceActions,
  }
}
