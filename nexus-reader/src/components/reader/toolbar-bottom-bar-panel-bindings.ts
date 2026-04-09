import { computed } from 'vue'
import type {
  ReaderToolbarBottomBarBindingResult,
  ReaderToolbarBottomBarPanelBindings,
} from './toolbar-bottom-bar-binding-types'
import {
  createReaderToolbarBottomBarBindings,
} from './toolbar-bottom-bar-bindings'
import type {
  ReaderToolbarBottomBarEmitFn,
} from './toolbar-bottom-bar-emit-types'
import type {
  ReaderToolbarBottomBarProps,
} from './toolbar-bottom-bar-prop-types'

export function createReaderToolbarBottomBarPanelBindings(
  props: ReaderToolbarBottomBarProps,
  emit: ReaderToolbarBottomBarEmitFn,
): ReaderToolbarBottomBarBindingResult {
  const {
    readingProgress,
    navigationProps,
    actionProps,
  } = createReaderToolbarBottomBarBindings(props)

  const panelBindings = computed<ReaderToolbarBottomBarPanelBindings>(() => ({
    readingProgress: readingProgress.value,
    navigationProps: navigationProps.value,
    actionProps: actionProps.value,
    onToggleDayNight: () => emit('toggleDayNight'),
    onToggleSettings: () => emit('toggleSettings'),
    onToggleEyeCare: () => emit('toggleEyeCare'),
    onToggleZenMode: () => emit('toggleZenMode'),
    onRefresh: () => emit('refresh'),
    onPrevChapter: () => emit('prevChapter'),
    onNextChapter: () => emit('nextChapter'),
    onOpenSourcePicker: () => emit('openSourcePicker'),
    onOpenBookInfo: () => emit('openBookInfo'),
  }))

  const isVisible = computed(() => props.show && !props.zenMode)

  return {
    panelBindings,
    isVisible,
  }
}
