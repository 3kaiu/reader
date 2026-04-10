import { computed } from 'vue'
import type { ReaderToolbarTopBarEmitFn } from './toolbar-top-bar-emit-types'
import type { ReaderToolbarTopBarProps } from './toolbar-top-bar-prop-types'

export function createReaderToolbarTopBarContentViewBindings(
  props: Pick<ReaderToolbarTopBarProps, 'isFullscreen'>,
  emit: ReaderToolbarTopBarEmitFn
) {
  const fullscreenIconProps = computed(() => ({
    isFullscreen: props.isFullscreen,
  }))

  return {
    fullscreenIconProps,
    onBack: () => emit('back'),
    onToggleCatalog: () => emit('toggleCatalog'),
    onToggleFullscreen: () => emit('toggleFullscreen'),
  }
}
