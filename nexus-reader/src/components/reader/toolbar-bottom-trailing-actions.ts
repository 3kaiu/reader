import {
  BookOpen,
  Settings,
} from 'lucide-vue-next'
import type { ReaderToolbarBottomAction } from './toolbar-bottom-action-contract-types'
import type { ReaderToolbarBottomActionsEmitFn } from './toolbar-bottom-action-emit-types'

export function createReaderToolbarBottomTrailingActions(
  emit: ReaderToolbarBottomActionsEmitFn,
): ReaderToolbarBottomAction[] {
  return [
    {
      key: 'zen-mode',
      label: '禅模式',
      icon: Settings,
      iconClass: 'w-5 h-5 text-primary',
    },
    {
      key: 'book-info',
      label: '详情',
      icon: BookOpen,
      iconClass: 'w-5 h-5',
      onClick: () => emit('openBookInfo'),
    },
  ]
}
