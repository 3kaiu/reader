import type { ReaderExperienceModelServiceOptions } from './experience-model-service-types'
import type { ReaderViewLayout } from './view-layout'
import type { ReaderExperienceModelFeatures } from './view-model-experience-feature-types'
import type { ReaderViewServices } from './view-services'

export function createReaderViewExperienceServiceOptions(
  services: ReaderViewServices,
  layout: ReaderViewLayout,
  features: ReaderExperienceModelFeatures
): ReaderExperienceModelServiceOptions {
  return {
    contentRef: features.session.contentRef,
    activeBookUrl: features.session.activeBookUrl,
    readerStore: services.readerStore,
    settingsStore: services.settingsStore,
    eyeCare: services.eyeCare,
    isFullscreen: layout.isFullscreen,
    contentStyle: features.actions.contentStyle,
    isNightMode: features.actions.isNightMode,
    formattedTime: layout.formattedTime,
  }
}
