import type { ReaderExperienceModelServiceOptions } from './experience-model-service-types'
import type { ReaderViewLayout, ReaderViewServices } from './view-dependencies'
import type { ReaderExperienceModelFeatures } from './view-model-experience-feature-types'

export function createReaderExperienceModelServiceOptions(
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
