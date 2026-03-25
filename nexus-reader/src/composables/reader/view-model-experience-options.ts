import type { ReaderExperienceModelOptions } from './experience-model'
import type { ReaderViewFeatures } from './view-features'
import type {
  ReaderViewLayout,
  ReaderViewServices,
} from './view-dependencies'

export function createReaderExperienceModelOptions(
  services: ReaderViewServices,
  layout: ReaderViewLayout,
  features: ReaderViewFeatures,
): ReaderExperienceModelOptions {
  return {
    contentRef: features.session.contentRef,
    activeBookUrl: features.session.activeBookUrl,
    readerStore: services.readerStore,
    settingsStore: services.settingsStore,
    decoderStore: services.decoderStore,
    eyeCare: services.eyeCare,
    decoderAddonEnabled: services.decoderAddonEnabled,
    showToolbar: features.chrome.showToolbar,
    showCatalog: features.chrome.showCatalog,
    showSettings: features.chrome.showSettings,
    showSourcePicker: features.chrome.showSourcePicker,
    showBookInfo: features.chrome.showBookInfo,
    showKeyboardHelp: features.chrome.showKeyboardHelp,
    showDecoderSettings: features.chrome.showDecoderSettings,
    isFullscreen: layout.isFullscreen,
    contentStyle: features.actions.contentStyle,
    isNightMode: features.actions.isNightMode,
    formattedTime: layout.formattedTime,
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
