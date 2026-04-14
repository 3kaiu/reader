import type { ReaderExperienceModelOptions } from './experience-model-option-types'
import { createReaderViewExperienceHandlerOptions } from './view-model-experience-handler-options'
import { createReaderViewExperienceServiceOptions } from './view-model-experience-service-options'
import { createReaderViewExperienceVisibilityOptions } from './view-model-experience-visibility-options'
import type { ReaderViewLayout } from './view-layout'
import type { ReaderExperienceModelFeatures } from './view-model-experience-feature-types'
import type { ReaderViewServices } from './view-services'

export function createReaderViewExperienceOptions(
  services: ReaderViewServices,
  layout: ReaderViewLayout,
  features: ReaderExperienceModelFeatures
): ReaderExperienceModelOptions {
  return {
    ...createReaderViewExperienceServiceOptions(services, layout, features),
    ...createReaderViewExperienceVisibilityOptions(features),
    ...createReaderViewExperienceHandlerOptions(layout, features),
  }
}
