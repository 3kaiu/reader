import type { ReaderExperienceModelServiceOptions } from './experience-model-service-types'
import type { ReaderExperienceModelVisibilityOptions } from './experience-model-visibility-types'
import type { ReaderExperienceVisibilityState } from './experience-types'

type ReaderExperienceVisibilityStateOptions = ReaderExperienceModelVisibilityOptions &
  Pick<ReaderExperienceModelServiceOptions, 'isFullscreen'>

export function createReaderExperienceVisibilityState(
  options: ReaderExperienceVisibilityStateOptions
): ReaderExperienceVisibilityState {
  return {
    showToolbar: options.showToolbar.value,
    showCatalog: options.showCatalog.value,
    showSettings: options.showSettings.value,
    showSourcePicker: options.showSourcePicker.value,
    showBookInfo: options.showBookInfo.value,
    showKeyboardHelp: options.showKeyboardHelp.value,
    isFullscreen: options.isFullscreen.value,
  }
}
