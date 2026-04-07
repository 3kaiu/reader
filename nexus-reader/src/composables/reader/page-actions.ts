import type { ReaderPageActions } from './page-action-types'
import type { ReaderPageModelChromeOptions } from './page-model-chrome-options'
import type { ReaderPageModelExperienceOptions } from './page-model-experience-options'

type ReaderPageActionOptions =
  ReaderPageModelChromeOptions &
  ReaderPageModelExperienceOptions

export function createReaderPageActions(
  options: ReaderPageActionOptions,
): ReaderPageActions {
  return {
    toggleToolbar: options.toggleToolbar,
    handlePrevChapter: options.readerExperienceActions.handlePrevChapter,
    handleNextChapter: options.readerExperienceActions.handleNextChapter,
    retryCurrentChapter: options.readerExperienceActions.handleRefresh,
    toggleFullscreen: options.readerExperienceActions.toggleFullscreen,
    toggleCatalog: options.toggleCatalog,
    toggleSettings: options.toggleSettings,
    toggleDayNight: options.readerExperienceActions.toggleDayNight,
    toggleZenMode: options.readerExperienceActions.toggleZenMode,
    toggleKeyboardHelp: options.toggleKeyboardHelp,
    handleEscape: options.handleEscape,
    openSourcePicker: options.openSourcePicker,
  }
}
