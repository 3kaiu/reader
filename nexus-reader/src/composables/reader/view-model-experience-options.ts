import type { ReaderExperienceModelOptions } from './experience-model-option-types'
import { createReaderExperienceModelHandlerOptions } from './view-model-experience-handler-options'
import { createReaderExperienceModelServiceOptions } from './view-model-experience-service-options'
import { createReaderExperienceModelVisibilityOptions } from './view-model-experience-visibility-options'
import type { ReaderViewLayout, ReaderViewServices } from './view-dependencies'
import type { ReaderExperienceModelFeatures } from './view-model-experience-feature-types'

export function createReaderExperienceModelOptions(
  services: ReaderViewServices,
  layout: ReaderViewLayout,
  features: ReaderExperienceModelFeatures
): ReaderExperienceModelOptions {
  return {
    ...createReaderExperienceModelServiceOptions(services, layout, features),
    ...createReaderExperienceModelVisibilityOptions(features),
    ...createReaderExperienceModelHandlerOptions(layout, features),
  }
}
