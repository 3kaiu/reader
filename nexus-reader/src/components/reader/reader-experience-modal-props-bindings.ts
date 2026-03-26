import type {
  ReaderExperienceModalBindingActions,
} from './reader-experience-modal-action-types'
import type { ReaderModalsProps } from './reader-modals-prop-types'

export function createReaderExperienceModalPropsBindings(
  modalProps: ReaderModalsProps,
  actions: ReaderExperienceModalBindingActions,
) {
  return {
    ...modalProps,
    'onUpdate:showCatalog': actions.setShowCatalog,
    'onUpdate:showSettings': actions.setShowSettings,
    'onUpdate:showSourcePicker': actions.setShowSourcePicker,
    'onUpdate:showBookInfo': actions.setShowBookInfo,
    'onUpdate:showKeyboardHelp': actions.setShowKeyboardHelp,
    onSelectChapter: actions.handleSelectChapter,
    onRefresh: actions.handleRefresh,
  }
}
