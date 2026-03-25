import { computed } from 'vue'
import type { ReaderExperienceState } from './experience-state-types'

export function createReaderExperienceModalProps(
  state: ReaderExperienceState,
) {
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
