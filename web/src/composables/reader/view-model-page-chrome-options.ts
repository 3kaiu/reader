import type { ReaderPageModelChromeOptions } from './page-model-types'
import type { ReaderPageModelFeatures } from './view-model-types'

export function createReaderViewPageChromeOptions(
  features: ReaderPageModelFeatures
): ReaderPageModelChromeOptions {
  return {
    toggleToolbar: features.chrome.toggleToolbar,
    toggleCatalog: features.chrome.toggleCatalog,
    toggleSettings: features.chrome.toggleSettings,
    toggleKeyboardHelp: features.chrome.toggleKeyboardHelp,
    handleEscape: features.chrome.handleEscape,
    openSourcePicker: features.chrome.openSourcePicker,
  }
}
