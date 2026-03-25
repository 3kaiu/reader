import type { ReaderPageActions } from './types'
import type { ReaderPageModelOptions } from './page-model-types'

export function createReaderPageActions(
  options: ReaderPageModelOptions,
): ReaderPageActions {
  return {
    toggleToolbar: options.toggleToolbar,
    handlePrevChapter: options.readerExperienceActions.handlePrevChapter,
    handleNextChapter: options.readerExperienceActions.handleNextChapter,
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
