import type { ComputedRef } from 'vue'
import type { ReaderProgressProps } from './reader-progress-prop-types'
import type { ReaderToolbarBottomActionsProps } from './toolbar-bottom-action-prop-types'
import type { ReaderNavigationProps } from './reader-navigation-types'

export interface ReaderToolbarBottomPanelNavigationBindings
  extends ReaderNavigationProps {
  onPrev: () => void
  onNext: () => void
}

export interface ReaderToolbarBottomPanelActionBindings
  extends ReaderToolbarBottomActionsProps {
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
