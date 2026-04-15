import { createReaderPageActions } from '@/composables/reader/page-actions'
import { createReaderPageState } from '@/composables/reader/page-state'
import type { ReaderPageExperienceActions } from './page-model-experience-options'
import { createReaderViewPageOptions } from './view-model-page-options'
import type { ReaderViewFeatures } from './view-feature-types'
import type { ReaderViewLayout } from './view-layout'
import type { ReaderViewServices } from './view-services'

export function createReaderViewPageModel(
  services: ReaderViewServices,
  layout: ReaderViewLayout,
  features: ReaderViewFeatures,
  readerExperienceActions: ReaderPageExperienceActions
) {
  const options = createReaderViewPageOptions(services, layout, features, readerExperienceActions)

  return {
    readerPageState: createReaderPageState(options),
    readerPageActions: createReaderPageActions(options),
  }
}
