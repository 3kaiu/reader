import { computed } from 'vue'
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
  props: ReaderToolbarPanelsProps
) {
  return computed<ReaderToolbarPanelsBottomBarBindings>(() => ({
    ...props.bottomBarProps,
    onToggleDayNight: props.onToggleDayNight!,
    onToggleSettings: props.onToggleSettings!,
    onToggleEyeCare: props.onToggleEyeCare!,
    onToggleZenMode: props.onToggleZenMode!,
    onRefresh: props.onRefresh!,
    onPrevChapter: props.onPrevChapter!,
    onNextChapter: props.onNextChapter!,
    onOpenSourcePicker: props.onOpenSourcePicker!,
    onOpenBookInfo: props.onOpenBookInfo!,
  }))
}
