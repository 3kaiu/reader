import type {
  ReaderExperienceModelHandlerOptions,
} from './experience-model-handler-types'
import type { ReaderViewLayout } from './view-dependencies'
import type {
  ReaderExperienceModelFeatures,
} from './view-model-experience-feature-types'

export function createReaderExperienceModelHandlerOptions(
  layout: ReaderViewLayout,
  features: ReaderExperienceModelFeatures,
): ReaderExperienceModelHandlerOptions {
  return {
    goBack: features.chrome.goBack,
    openCatalog: features.chrome.openCatalog,
    toggleFullscreen: layout.toggleFullscreen,
    toggleDayNight: features.actions.toggleDayNight,
    openSettings: features.chrome.openSettings,
    toggleZenMode: features.chrome.toggleZenMode,
    openSourcePicker: features.chrome.openSourcePicker,
    openBookInfo: features.chrome.openBookInfo,
    openDecoderSettings: features.chrome.openDecoderSettings,
    handleRefresh: features.actions.handleRefresh,
    handlePrevChapter: features.actions.handlePrevChapter,
    handleNextChapter: features.actions.handleNextChapter,
    handleSelectChapter: features.actions.handleSelectChapter,
    handleToggleDecoder: features.decoder.handleToggleDecoder,
    decodeCurrentChapter: features.decoder.decodeCurrentChapter,
    handleEntityClick: features.decoder.handleEntityClick,
    handleConfirmEntity: features.decoder.handleConfirmEntity,
    handleCorrectEntity: features.decoder.handleCorrectEntity,
  }
}
