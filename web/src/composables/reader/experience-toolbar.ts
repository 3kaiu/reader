import { computed } from 'vue'
import type { ReaderExperienceDisplayState } from './experience-types'
import type { ReaderExperienceServiceState } from './experience-state-service-types'
import type { ReaderExperienceVisibilityState } from './experience-types'

type ReaderExperienceToolbarState = ReaderExperienceServiceState &
  ReaderExperienceVisibilityState &
  ReaderExperienceDisplayState

export function createReaderExperienceToolbarProps(state: ReaderExperienceToolbarState) {
  return computed(() => ({
    show: state.showToolbar,
    zenMode: state.settingsStore.config.zenMode,
    bookName: state.readerStore.currentBook?.name,
    chapterTitle: state.readerStore.currentChapter?.title,
    currentChapterIndex: state.readerStore.currentChapterIndex,
    totalChapters: state.readerStore.totalChapters,
    hasPrevChapter: state.readerStore.hasPrevChapter,
    hasNextChapter: state.readerStore.hasNextChapter,
    isNightMode: state.isNightMode,
    isFullscreen: state.isFullscreen,
    isEyeCareEnabled: state.eyeCare.config.value.enabled,
    contentIssue: state.readerStore.loadError,
  }))
}
