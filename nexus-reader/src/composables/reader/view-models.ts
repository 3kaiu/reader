import {
  createReaderExperienceModel,
} from '@/composables/reader/experience-model'
import { createReaderPageModel } from '@/composables/reader/page-model'
import {
  createReaderExperienceModelOptions,
  createReaderPageModelOptions,
} from './view-model-options'
import type {
  ReaderViewFeatures,
} from './view-features'
import type {
  ReaderViewLayout,
  ReaderViewServices,
} from './view-dependencies'

export function createReaderViewModels(
  services: ReaderViewServices,
  layout: ReaderViewLayout,
  features: ReaderViewFeatures,
) {
  const { readerExperienceState, readerExperienceActions } =
    createReaderExperienceModel(
      createReaderExperienceModelOptions(services, layout, features),
    )

  const { readerPageState, readerPageActions } = createReaderPageModel({
    ...createReaderPageModelOptions(
      services,
      layout,
      features,
      readerExperienceActions,
    ),
  })

  return {
    readerPageState,
    readerPageActions,
    readerExperienceState,
    readerExperienceActions,
  }
}
