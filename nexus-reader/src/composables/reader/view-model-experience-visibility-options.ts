import type { ReaderExperienceModelVisibilityOptions } from './experience-model-visibility-types'
import type { ReaderExperienceModelFeatures } from './view-model-experience-feature-types'

export function createReaderExperienceModelVisibilityOptions(
  features: ReaderExperienceModelFeatures
): ReaderExperienceModelVisibilityOptions {
  return {
    showToolbar: features.chrome.showToolbar,
    showCatalog: features.chrome.showCatalog,
    showSettings: features.chrome.showSettings,
    showSourcePicker: features.chrome.showSourcePicker,
    showBookInfo: features.chrome.showBookInfo,
    showKeyboardHelp: features.chrome.showKeyboardHelp,
  }
}
