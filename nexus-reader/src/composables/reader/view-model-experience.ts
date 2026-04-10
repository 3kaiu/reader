import { createReaderExperienceModel } from '@/composables/reader/experience-model'
import { createReaderExperienceModelOptions } from './view-model-experience-options'
import type { ReaderViewLayout, ReaderViewServices } from './view-dependencies'
import type { ReaderViewFeatures } from './view-feature-types'

export function createReaderViewExperienceModel(
  services: ReaderViewServices,
  layout: ReaderViewLayout,
  features: ReaderViewFeatures
) {
  return createReaderExperienceModel(createReaderExperienceModelOptions(services, layout, features))
}
