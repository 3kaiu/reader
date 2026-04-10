import { computed } from 'vue'
import type { ReaderExperienceDisplayState } from './experience-state-display-types'
import type { ReaderExperienceServiceState } from './experience-state-service-types'
import type { ReaderExperienceVisibilityState } from './experience-state-visibility-types'

type ReaderExperienceModalState = ReaderExperienceServiceState &
  ReaderExperienceVisibilityState &
  ReaderExperienceDisplayState

export function createReaderExperienceModalProps(state: ReaderExperienceModalState) {
  return computed(() => ({
    showCatalog: state.showCatalog,
    showSettings: state.showSettings,
    showSourcePicker: state.showSourcePicker,
    showBookInfo: state.showBookInfo,
    showKeyboardHelp: state.showKeyboardHelp,
    book: state.readerStore.currentBook,
    chapters: state.readerStore.catalog,
    currentInd: state.readerStore.currentChapterIndex,
    catalogLoading: state.readerStore.isLoading,
    keyboardShortcuts: state.keyboardShortcuts,
  }))
}
