import { RotateCcw, Type } from 'lucide-vue-next'
import type { ReaderToolbarBottomAction } from './toolbar-bottom-action-contract-types'
import type { ReaderToolbarBottomActionsBindings } from './toolbar-bottom-actions'

export function createReaderToolbarBottomReaderActions(
  props: ReaderToolbarBottomActionsBindings
): ReaderToolbarBottomAction[] {
  return [
    {
      key: 'settings',
      label: '设置',
      icon: Type,
      iconClass: 'w-5 h-5',
      onClick: props.onToggleSettings,
    },
    {
      key: 'refresh',
      label: '刷新',
      icon: RotateCcw,
      iconClass: 'w-5 h-5',
      onClick: props.onRefresh,
    },
  ]
}
