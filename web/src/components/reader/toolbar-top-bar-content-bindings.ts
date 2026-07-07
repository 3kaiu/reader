import { computed } from 'vue'
import type { ComputedRef } from 'vue'
import type { ReaderToolbarTopBarProps } from './toolbar-top-bar-prop-types'

export interface ReaderToolbarTopBarContentBindings extends ReaderToolbarTopBarProps {
  onBack: () => void
  onToggleCatalog: () => void
  onToggleFullscreen: () => void
}

export interface ReaderToolbarTopBarBindingResult {
  contentBindings: ComputedRef<ReaderToolbarTopBarContentBindings>
  isVisible: ComputedRef<boolean>
}

export function createReaderToolbarTopBarBindings(
  props: ReaderToolbarTopBarProps
): ReaderToolbarTopBarBindingResult {
  const contentBindings = computed<ReaderToolbarTopBarContentBindings>(() => ({
    ...props,
    onBack: props.onBack!,
    onToggleCatalog: props.onToggleCatalog!,
    onToggleFullscreen: props.onToggleFullscreen!,
  }))

  const isVisible = computed(() => props.show && !props.zenMode)

  return {
    contentBindings,
    isVisible,
  }
}
