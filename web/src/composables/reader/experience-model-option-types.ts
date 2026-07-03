import type { ReaderExperienceModelHandlerOptions } from './experience-types'
import type { ReaderExperienceModelServiceOptions } from './experience-model-service-types'
import type { ReaderExperienceModelVisibilityOptions } from './experience-model-visibility-types'

export type ReaderExperienceModelOptions = ReaderExperienceModelServiceOptions &
  ReaderExperienceModelVisibilityOptions &
  ReaderExperienceModelHandlerOptions
