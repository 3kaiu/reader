import { computed } from 'vue'
import type { ReaderExperienceDisplayState } from './experience-types'
import type { ReaderExperienceServiceState } from './experience-state-service-types'
import type { ReaderExperienceVisibilityState } from './experience-types'

type ReaderExperienceContentState = ReaderExperienceServiceState &
  ReaderExperienceVisibilityState &
  ReaderExperienceDisplayState

export function createReaderExperienceContentProps(state: ReaderExperienceContentState) {
  return computed(() => ({
    contentStyle: state.contentStyle,
    loadedChapters: state.readerStore.loadedChapters,
    isLoadingMore: state.readerStore.isLoadingMore,
    isFullscreen: state.isFullscreen,
    formattedTime: state.formattedTime,
    paragraphSpacing: state.settingsStore.config.paragraphSpacing,
    isParsing: state.readerStore.isParsing,
    hasNextChapter: state.readerStore.hasNextChapter,
    loadError: state.readerStore.loadError,
    loadErrorDetails: state.readerStore.loadErrorDetails,
  }))
}
