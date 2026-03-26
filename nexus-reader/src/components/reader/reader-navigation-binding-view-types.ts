import type { ComputedRef } from 'vue'
import type {
  ReaderNavigationContentProps,
} from './reader-navigation-content-prop-types'

export interface ReaderNavigationContentBindings
  extends ReaderNavigationContentProps {
  onPrev: () => void
  onNext: () => void
}

export interface ReaderNavigationViewBindingResult {
  contentBindings: ComputedRef<ReaderNavigationContentBindings>
}
