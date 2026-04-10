import { computed } from 'vue'
import type {
  ReaderToolbarBottomPanelBindingResult,
  ReaderToolbarBottomPanelActionBindings,
  ReaderToolbarBottomPanelNavigationBindings,
} from './toolbar-bottom-panel-binding-types'
import type { ReaderToolbarBottomPanelEmitFn } from './toolbar-bottom-panel-emit-types'
import type { ReaderToolbarBottomPanelProps } from './toolbar-bottom-panel-prop-types'

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
