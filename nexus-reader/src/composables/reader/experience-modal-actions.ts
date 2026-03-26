import type {
  ReaderExperienceModalActions,
} from './experience-modal-action-types'
import type {
  ReaderExperienceModelVisibilityOptions,
} from './experience-model-visibility-types'

export function createReaderExperienceModalActions(
  options: ReaderExperienceModelVisibilityOptions,
): ReaderExperienceModalActions {
  return {
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
