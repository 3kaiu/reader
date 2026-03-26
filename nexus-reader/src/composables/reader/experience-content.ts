import { computed } from 'vue'
import type {
  ReaderExperienceDisplayState,
} from './experience-state-display-types'
import type {
  ReaderExperienceServiceState,
} from './experience-state-service-types'
import type {
  ReaderExperienceVisibilityState,
} from './experience-state-visibility-types'

type ReaderExperienceContentState =
  ReaderExperienceServiceState &
  ReaderExperienceVisibilityState &
  ReaderExperienceDisplayState

export function createReaderExperienceContentProps(
  state: ReaderExperienceContentState,
) {
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
    decoderEnabled:
      state.decoderAddonEnabled && state.decoderStore.isEnabled,
    decoderEntities: state.decoderAddonEnabled
      ? state.decoderStore.currentEntities
      : [],
  }))
}
