import { type Ref } from 'vue'
import { createReaderViewServices } from '@/composables/reader/view-services'
import { createReaderViewLayout } from '@/composables/reader/view-layout'
import { createReaderViewFeatures } from '@/composables/reader/view-features'
import { createReaderViewModels } from '@/composables/reader/view-models'

export function useReaderView(readerRef: Ref<HTMLElement | null>) {
  const services = createReaderViewServices()
  const layout = createReaderViewLayout(readerRef)
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
