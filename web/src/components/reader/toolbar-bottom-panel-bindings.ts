import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import type { ReaderToolbarBottomPanelEmitFn } from './toolbar-bottom-panel-emit-types'
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
  props: ReaderToolbarBottomPanelProps,
  emit: ReaderToolbarBottomPanelEmitFn
): ReaderToolbarBottomPanelBindingResult {
  const navigationBindings = computed<ReaderToolbarBottomPanelNavigationBindings>(() => ({
    ...props.navigationProps,
    onPrev: () => emit('prevChapter'),
    onNext: () => emit('nextChapter'),
  }))

  const progressProps = computed(() => ({
    progress: props.readingProgress,
  }))

  const actionBindings = computed<ReaderToolbarBottomPanelActionBindings>(() => ({
    ...props.actionProps,
    onToggleDayNight: () => emit('toggleDayNight'),
    onToggleSettings: () => emit('toggleSettings'),
    onToggleEyeCare: () => emit('toggleEyeCare'),
    onToggleZenMode: () => emit('toggleZenMode'),
    onRefresh: () => emit('refresh'),
    onOpenSourcePicker: () => emit('openSourcePicker'),
    onOpenBookInfo: () => emit('openBookInfo'),
  }))

  return {
    navigationBindings,
    progressProps,
    actionBindings,
  }
}
