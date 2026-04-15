import type { IconComponent } from '@/types/components'

export interface ReaderToolbarBottomAction {
  key: string
  label: string
  icon: IconComponent
  iconClass?: string
  activeClass?: string
  isActive?: boolean
  showIndicator?: boolean
  indicatorClass?: string
  onClick: () => void
  onContextmenu?: (event: MouseEvent) => void
}
