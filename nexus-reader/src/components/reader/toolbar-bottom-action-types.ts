import type { IconComponent } from '@/types/components'

export interface ReaderToolbarBottomActionsProps {
  isNightMode: boolean
  isEyeCareEnabled: boolean
  contentIssue?: string | null
  showDecoderAction?: boolean
  isDecoderEnabled?: boolean
  isDecoding?: boolean
}

export type ReaderToolbarBottomActionsEmits = {
  toggleDayNight: []
  toggleSettings: []
  toggleEyeCare: []
  toggleZenMode: []
  refresh: []
  openSourcePicker: []
  openBookInfo: []
  toggleDecoder: [enabled: boolean]
  openDecoderSettings: []
}

export type ReaderToolbarBottomActionsEmitFn =
  <EventName extends keyof ReaderToolbarBottomActionsEmits>(
    event: EventName,
    ...args: ReaderToolbarBottomActionsEmits[EventName]
  ) => void

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
