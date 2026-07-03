import type { ReaderPageModelOptions } from './page-model-types'
import type { ReaderPageExperienceActions } from './page-model-types'
import { createReaderViewPageChromeOptions } from './view-model-page-chrome-options'
import { createReaderViewPageExperienceOptions } from './view-model-page-experience-options'
import { createReaderViewPageStateOptions } from './view-model-page-state-options'
import type { ReaderViewLayout } from './view-layout'
import type { ReaderPageModelFeatures } from './view-model-types'
import type { ReaderViewServices } from './view-services'

export function createReaderViewPageOptions(
  services: ReaderViewServices,
  _layout: ReaderViewLayout,
  features: ReaderPageModelFeatures,
  readerExperienceActions: ReaderPageExperienceActions
): ReaderPageModelOptions {
  return {
    ...createReaderViewPageStateOptions(services, features),
    ...createReaderViewPageChromeOptions(features),
    ...createReaderViewPageExperienceOptions(readerExperienceActions),
  }
}
