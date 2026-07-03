import type { ReaderPageActions } from './view-model-types'
import type { ReaderPageModelChromeOptions } from './page-model-types'
import type { ReaderPageModelExperienceOptions } from './page-model-types'

type ReaderPageActionOptions = ReaderPageModelChromeOptions & ReaderPageModelExperienceOptions

export function createReaderPageActions(options: ReaderPageActionOptions): ReaderPageActions {
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
