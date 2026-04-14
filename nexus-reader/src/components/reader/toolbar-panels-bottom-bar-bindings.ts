import { computed } from 'vue'
import type { ReaderToolbarPanelsEmitFn } from './toolbar-panels-emit-types'
import type { ReaderToolbarPanelsProps } from './toolbar-panels-prop-types'
import type { ReaderToolbarBottomBarProps } from './toolbar-bottom-bar-prop-types'

export interface ReaderToolbarPanelsBottomBarBindings extends ReaderToolbarBottomBarProps {
  onToggleDayNight: () => void
  onToggleSettings: () => void
  onToggleEyeCare: () => void
  onToggleZenMode: () => void
  onRefresh: () => void
  onPrevChapter: () => void
  onNextChapter: () => void
  onOpenSourcePicker: () => void
  onOpenBookInfo: () => void
}

export function createReaderToolbarPanelsBottomBarBindings(
  props: ReaderToolbarPanelsProps,
  emit: ReaderToolbarPanelsEmitFn
) {
  return computed<ReaderToolbarPanelsBottomBarBindings>(() => ({
    ...props.bottomBarProps,
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
}
