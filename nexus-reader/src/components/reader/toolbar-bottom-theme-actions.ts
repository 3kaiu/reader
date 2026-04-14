import { Eye, Moon, Sun } from 'lucide-vue-next'
import type { ReaderToolbarBottomAction } from './toolbar-bottom-action-contract-types'
import type { ReaderToolbarBottomActionsBindings } from './toolbar-bottom-actions'

export function createReaderToolbarBottomThemeActions(
  props: ReaderToolbarBottomActionsBindings
): ReaderToolbarBottomAction[] {
  return [
    {
      key: 'day-night',
      label: props.isNightMode ? '夜间' : '日间',
      icon: props.isNightMode ? Moon : Sun,
      iconClass: 'w-5 h-5',
      onClick: props.onToggleDayNight,
    },
    {
      key: 'eye-care',
      label: props.isEyeCareEnabled ? '护眼开' : '护眼',
      icon: Eye,
      iconClass: 'w-5 h-5',
      activeClass: 'text-green-500',
      isActive: props.isEyeCareEnabled,
      onClick: props.onToggleEyeCare,
    },
  ]
}
