import { createReaderExperienceActions } from '@/composables/reader/experience-actions'
import { createReaderExperienceState } from '@/composables/reader/experience-state'
import { createReaderViewExperienceOptions } from './view-model-experience-options'
import type { ReaderViewFeatures } from './view-model-types'
import type { ReaderViewLayout } from './view-layout'
import type { ReaderViewServices } from './view-services'

export function createReaderViewExperienceModel(
  services: ReaderViewServices,
  layout: ReaderViewLayout,
  features: ReaderViewFeatures
) {
  const options = createReaderViewExperienceOptions(services, layout, features)

  return {
    readerExperienceState: createReaderExperienceState(options),
    readerExperienceActions: createReaderExperienceActions(options),
  }
}
