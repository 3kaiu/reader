import { computed } from 'vue'

export interface ReaderNavigationButtonProps {
  disabled: boolean
  onClick: () => void
}

export function createReaderNavigationButtonViewBindings(props: ReaderNavigationButtonProps) {
  const buttonClass = computed(() => ({
    disabled: props.disabled,
  }))

  return {
    buttonClass,
    onClick: props.onClick,
  }
}
