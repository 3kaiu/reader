import { createReaderViewExperienceModel } from './view-model-experience'
import { createReaderViewPageModel } from './view-model-page'
import type { ReaderViewLayout, ReaderViewServices } from './view-dependencies'
import type { ReaderViewFeatures } from './view-feature-types'
import type { ReaderViewModelResult } from './view-model-result-types'

export function createReaderViewModels(
  services: ReaderViewServices,
  layout: ReaderViewLayout,
  features: ReaderViewFeatures
): ReaderViewModelResult {
  const { readerExperienceState, readerExperienceActions } = createReaderViewExperienceModel(
    services,
    layout,
    features
  )

  const { readerPageState, readerPageActions } = createReaderViewPageModel(
    services,
    layout,
    features,
    readerExperienceActions
  )

  return {
    readerPageState,
    readerPageActions,
    readerExperienceState,
    readerExperienceActions,
  }
}
