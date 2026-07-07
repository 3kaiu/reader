import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import { createReaderToolbarBottomBarBindings } from './toolbar-bottom-bar-bindings'
import type { ReaderToolbarBottomBarProps } from './toolbar-bottom-bar-prop-types'
import type { ReaderToolbarBottomPanelProps } from './toolbar-bottom-panel-prop-types'

export interface ReaderToolbarBottomBarPanelBindings extends ReaderToolbarBottomPanelProps {
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

export interface ReaderToolbarBottomBarBindingResult {
  panelBindings: ComputedRef<ReaderToolbarBottomBarPanelBindings>
  isVisible: ComputedRef<boolean>
}

export function createReaderToolbarBottomBarPanelBindings(
  props: ReaderToolbarBottomBarProps
): ReaderToolbarBottomBarBindingResult {
  const { readingProgress, navigationProps, actionProps } =
    createReaderToolbarBottomBarBindings(props)

  const panelBindings = computed<ReaderToolbarBottomBarPanelBindings>(() => ({
    readingProgress: readingProgress.value,
    navigationProps: navigationProps.value,
    actionProps: actionProps.value,
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

  const isVisible = computed(() => props.show && !props.zenMode)

  return {
    panelBindings,
    isVisible,
  }
}
