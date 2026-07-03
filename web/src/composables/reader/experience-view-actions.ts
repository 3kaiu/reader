import type { ReaderContentInstance } from './shared-types'
import type { ReaderExperienceViewActions } from './experience-types'
import type { ReaderExperienceModelHandlerOptions } from './experience-types'
import type { ReaderExperienceModelServiceOptions } from './experience-model-service-types'

type ReaderExperienceViewActionOptions = Pick<ReaderExperienceModelServiceOptions, 'contentRef'> &
  Pick<
    ReaderExperienceModelHandlerOptions,
    | 'goBack'
    | 'openCatalog'
    | 'toggleFullscreen'
    | 'toggleDayNight'
    | 'openSettings'
    | 'toggleZenMode'
    | 'openSourcePicker'
    | 'openBookInfo'
  >

export function createReaderExperienceViewActions(
  options: ReaderExperienceViewActionOptions
): ReaderExperienceViewActions {
  return {
    bindContentRef(instance) {
      options.contentRef.value = instance as ReaderContentInstance
    },
    goBack: options.goBack,
    openCatalog: options.openCatalog,
    toggleFullscreen: options.toggleFullscreen,
    toggleDayNight: options.toggleDayNight,
    openSettings: options.openSettings,
    toggleZenMode: options.toggleZenMode,
    openSourcePicker: options.openSourcePicker,
    openBookInfo: options.openBookInfo,
  }
}
