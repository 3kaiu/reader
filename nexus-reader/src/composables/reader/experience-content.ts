import { computed } from 'vue'
import type { ReaderExperienceState } from './experience-state-types'

export function createReaderExperienceContentProps(
  state: ReaderExperienceState,
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
