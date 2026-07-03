import { computed } from 'vue'
import { createReaderExperienceDisplayState } from './experience-display-state'
import { createReaderExperienceServiceState } from './experience-service-state'
import type { ReaderExperienceState } from './experience-types'
import { createReaderExperienceVisibilityState } from './experience-visibility-state'
import type { ReaderExperienceModelServiceOptions } from './experience-model-service-types'
import type { ReaderExperienceModelVisibilityOptions } from './experience-model-visibility-types'

type ReaderExperienceStateOptions = ReaderExperienceModelServiceOptions &
  ReaderExperienceModelVisibilityOptions

export function createReaderExperienceState(options: ReaderExperienceStateOptions) {
  return computed<ReaderExperienceState>(() => {
    const serviceState = createReaderExperienceServiceState(options)
    const visibilityState = createReaderExperienceVisibilityState(options)
    const displayState = createReaderExperienceDisplayState(options)

    return {
      ...serviceState,
      ...visibilityState,
      ...displayState,
    }
  })
}
