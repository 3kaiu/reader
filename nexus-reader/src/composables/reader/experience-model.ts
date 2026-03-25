import { createReaderExperienceActions } from './experience-actions'
import { createReaderExperienceState } from './experience-state'
import type { ReaderExperienceModelOptions } from './experience-model-types'

export type { ReaderExperienceModelOptions } from './experience-model-types'

export function createReaderExperienceModel(
  options: ReaderExperienceModelOptions,
) {
  const readerExperienceState = createReaderExperienceState(options)
  const readerExperienceActions = createReaderExperienceActions(options)

  return {
    readerExperienceState,
    readerExperienceActions,
  }
}
