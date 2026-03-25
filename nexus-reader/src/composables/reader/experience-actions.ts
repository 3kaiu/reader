import type {
  ReaderContentInstance,
} from './types'
import type { ReaderExperienceActions } from './experience-action-types'
import type { ReaderExperienceModelHandlerOptions } from './experience-model-handler-types'
import type { ReaderExperienceModelServiceOptions } from './experience-model-service-types'
import type { ReaderExperienceModelVisibilityOptions } from './experience-model-visibility-types'

type ReaderExperienceActionOptions =
  Pick<ReaderExperienceModelServiceOptions, 'contentRef'> &
  ReaderExperienceModelVisibilityOptions &
  ReaderExperienceModelHandlerOptions

export function createReaderExperienceActions(
  options: ReaderExperienceActionOptions,
): ReaderExperienceActions {
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
    openDecoderSettings: options.openDecoderSettings,
    handleRefresh: options.handleRefresh,
    handlePrevChapter: options.handlePrevChapter,
    handleNextChapter: options.handleNextChapter,
    handleSelectChapter: options.handleSelectChapter,
    handleToggleDecoder: options.handleToggleDecoder,
    decodeCurrentChapter: options.decodeCurrentChapter,
    handleEntityClick: options.handleEntityClick,
    handleConfirmEntity: options.handleConfirmEntity,
    handleCorrectEntity: options.handleCorrectEntity,
    setShowCatalog(value) {
      options.showCatalog.value = value
    },
    setShowSettings(value) {
      options.showSettings.value = value
    },
    setShowSourcePicker(value) {
      options.showSourcePicker.value = value
    },
    setShowBookInfo(value) {
      options.showBookInfo.value = value
    },
    setShowKeyboardHelp(value) {
      options.showKeyboardHelp.value = value
    },
    setShowDecoderSettings(value) {
      options.showDecoderSettings.value = value
    },
  }
}
