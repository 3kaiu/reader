import type { ReaderPageModelOptions } from './page-model-option-types'
import type { ReaderPageExperienceActions } from './page-model-experience-options'
import { createReaderPageModelChromeOptions } from './view-model-page-chrome-options'
import { createReaderPageModelExperienceOptions } from './view-model-page-experience-options'
import { createReaderPageModelStateOptions } from './view-model-page-state-options'
import type { ReaderViewLayout, ReaderViewServices } from './view-dependencies'
import type { ReaderPageModelFeatures } from './view-model-page-feature-types'

export function createReaderPageModelOptions(
  services: ReaderViewServices,
  _layout: ReaderViewLayout,
  features: ReaderPageModelFeatures,
  readerExperienceActions: ReaderPageExperienceActions
): ReaderPageModelOptions {
  return {
    ...createReaderPageModelStateOptions(services, features),
    ...createReaderPageModelChromeOptions(features),
    ...createReaderPageModelExperienceOptions(readerExperienceActions),
  }
}
