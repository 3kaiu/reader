import { computed } from 'vue'
import type { ReaderExperienceState } from './experience-state-types'

export function createReaderExperienceToolbarProps(
  state: ReaderExperienceState,
) {
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
    showDecoderAction: state.decoderAddonEnabled,
    isDecoderEnabled:
      state.decoderAddonEnabled && state.decoderStore.isEnabled,
    isDecoding:
      state.decoderAddonEnabled && state.decoderStore.isDecoding,
  }))
}
