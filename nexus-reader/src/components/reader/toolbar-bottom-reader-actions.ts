import { RotateCcw, Type } from 'lucide-vue-next'
import type { ReaderToolbarBottomAction } from './toolbar-bottom-action-contract-types'
import type { ReaderToolbarBottomActionsEmitFn } from './toolbar-bottom-action-emit-types'

export function createReaderToolbarBottomReaderActions(
  emit: ReaderToolbarBottomActionsEmitFn
): ReaderToolbarBottomAction[] {
  return [
    {
      key: 'settings',
      label: '设置',
      icon: Type,
      iconClass: 'w-5 h-5',
      onClick: () => emit('toggleSettings'),
    },
    {
      key: 'refresh',
      label: '刷新',
      icon: RotateCcw,
      iconClass: 'w-5 h-5',
      onClick: () => emit('refresh'),
    },
  ]
}
