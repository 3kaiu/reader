import { computed } from 'vue'

export interface ReaderToolbarActionButtonProps {
  label: string
  activeClass?: string
  isActive?: boolean
  showIndicator?: boolean
  indicatorClass?: string
  onClick: () => void
  onContextmenu?: (event: MouseEvent) => void
}

export function createReaderToolbarActionButtonViewBindings(props: ReaderToolbarActionButtonProps) {
  const buttonClass = computed(() => (props.isActive ? (props.activeClass ?? '') : ''))

  return {
    buttonClass,
    onClick: props.onClick,
    onContextmenu: props.onContextmenu,
  }
}
