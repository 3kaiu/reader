import type { ComputedRef } from 'vue'
import type { ReaderNavigationButtonProps } from './reader-navigation-button-prop-types'
import type { ReaderNavigationProgressProps } from './reader-navigation-progress-prop-types'

export interface ReaderNavigationButtonBindings extends ReaderNavigationButtonProps {
  onClick: () => void
}

export interface ReaderNavigationContentViewBindingResult {
  previousButtonBindings: ComputedRef<ReaderNavigationButtonBindings>
  nextButtonBindings: ComputedRef<ReaderNavigationButtonBindings>
  progressProps: ComputedRef<ReaderNavigationProgressProps>
}
