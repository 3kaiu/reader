import { createReaderPageModel } from '@/composables/reader/page-model'
import type {
  ReaderPageExperienceActions,
} from './page-model-experience-options'
import { createReaderPageModelOptions } from './view-model-page-options'
import type {
  ReaderViewLayout,
  ReaderViewServices,
} from './view-dependencies'
import type {
  ReaderViewFeatures,
} from './view-feature-types'

export function createReaderViewPageModel(
  services: ReaderViewServices,
  layout: ReaderViewLayout,
  features: ReaderViewFeatures,
  readerExperienceActions: ReaderPageExperienceActions,
) {
  return createReaderPageModel(
    createReaderPageModelOptions(
      services,
      layout,
      features,
      readerExperienceActions,
    ),
  )
}
