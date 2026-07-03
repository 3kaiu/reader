import type { ReaderExperienceActions } from './experience-types'
import { createReaderExperienceModalActions } from './experience-modal-actions'
import type { ReaderExperienceModelHandlerOptions } from './experience-types'
import type { ReaderExperienceModelServiceOptions } from './experience-model-service-types'
import type { ReaderExperienceModelVisibilityOptions } from './experience-model-visibility-types'
import { createReaderExperienceReadingActions } from './experience-reading-actions'
import { createReaderExperienceViewActions } from './experience-view-actions'

type ReaderExperienceActionOptions = Pick<ReaderExperienceModelServiceOptions, 'contentRef'> &
  ReaderExperienceModelVisibilityOptions &
  ReaderExperienceModelHandlerOptions

export function createReaderExperienceActions(
  options: ReaderExperienceActionOptions
): ReaderExperienceActions {
  const viewActions = createReaderExperienceViewActions(options)
  const readingActions = createReaderExperienceReadingActions(options)
  const modalActions = createReaderExperienceModalActions(options)

  return {
    ...viewActions,
    ...readingActions,
    ...modalActions,
  }
}
