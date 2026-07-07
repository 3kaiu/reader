import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import type { ReaderToolbarBottomPanelProps } from './toolbar-bottom-panel-prop-types'
import type { ReaderProgressProps } from './reader-progress-view-bindings'
import type { ReaderToolbarBottomActionsProps } from './toolbar-bottom-action-prop-types'
import type { ReaderNavigationProps } from './reader-navigation-types'

export interface ReaderToolbarBottomPanelNavigationBindings extends ReaderNavigationProps {
  onPrev: () => void
  onNext: () => void
}

export interface ReaderToolbarBottomPanelActionBindings extends ReaderToolbarBottomActionsProps {
  onToggleDayNight: () => void
  onToggleSettings: () => void
  onToggleEyeCare: () => void
  onToggleZenMode: () => void
  onRefresh: () => void
  onOpenSourcePicker: () => void
  onOpenBookInfo: () => void
}

export interface ReaderToolbarBottomPanelBindingResult {
  navigationBindings: ComputedRef<ReaderToolbarBottomPanelNavigationBindings>
  progressProps: ComputedRef<ReaderProgressProps>
  actionBindings: ComputedRef<ReaderToolbarBottomPanelActionBindings>
}

export function createReaderToolbarBottomPanelBindings(
  props: ReaderToolbarBottomPanelProps
): ReaderToolbarBottomPanelBindingResult {
  const navigationBindings = computed<ReaderToolbarBottomPanelNavigationBindings>(() => ({
    ...props.navigationProps,
    onPrev: props.onPrevChapter!,
    onNext: props.onNextChapter!,
  }))

  const progressProps = computed(() => ({
    progress: props.readingProgress,
  }))

  const actionBindings = computed<ReaderToolbarBottomPanelActionBindings>(() => ({
    ...props.actionProps,
    onToggleDayNight: props.onToggleDayNight!,
    onToggleSettings: props.onToggleSettings!,
    onToggleEyeCare: props.onToggleEyeCare!,
    onToggleZenMode: props.onToggleZenMode!,
    onRefresh: props.onRefresh!,
    onOpenSourcePicker: props.onOpenSourcePicker!,
    onOpenBookInfo: props.onOpenBookInfo!,
  }))

  return {
    navigationBindings,
    progressProps,
    actionBindings,
  }
}
