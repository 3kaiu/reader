import { createReaderViewExperienceModel } from './view-model-experience'
import { createReaderViewPageModel } from './view-model-page'
import type { ReaderViewFeatures } from './view-model-types'
import type { ReaderViewLayout } from './view-layout'
import type { ReaderViewModelResult } from './view-model-types'
import type { ReaderViewServices } from './view-services'

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
