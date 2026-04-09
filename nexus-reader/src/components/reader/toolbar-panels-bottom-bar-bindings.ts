import { computed } from 'vue'
import type {
  ReaderToolbarPanelsBottomBarBindings,
} from './toolbar-panels-binding-types'
import type {
  ReaderToolbarPanelsEmitFn,
} from './toolbar-panels-emit-types'
import type { ReaderToolbarPanelsProps } from './toolbar-panels-prop-types'

export function createReaderToolbarPanelsBottomBarBindings(
  props: ReaderToolbarPanelsProps,
  emit: ReaderToolbarPanelsEmitFn,
) {
  return computed<ReaderToolbarPanelsBottomBarBindings>(() => ({
    ...props.bottomBarProps,
    onToggleDayNight: () => emit('toggleDayNight'),
    onToggleSettings: () => emit('toggleSettings'),
    onToggleEyeCare: () => emit('toggleEyeCare'),
    onRefresh: () => emit('refresh'),
    onPrevChapter: () => emit('prevChapter'),
    onNextChapter: () => emit('nextChapter'),
    onOpenSourcePicker: () => emit('openSourcePicker'),
    onOpenBookInfo: () => emit('openBookInfo'),
  }))
}
