import { BookOpen, Settings } from 'lucide-vue-next'
import type { ReaderToolbarBottomAction } from './toolbar-bottom-action-contract-types'
import type { ReaderToolbarBottomActionsBindings } from './toolbar-bottom-actions'

export function createReaderToolbarBottomTrailingActions(
  props: ReaderToolbarBottomActionsBindings
): ReaderToolbarBottomAction[] {
  return [
    {
      key: 'zen-mode',
      label: '禅模式',
      icon: Settings,
      iconClass: 'w-5 h-5 text-primary',
      onClick: props.onToggleZenMode,
    },
    {
      key: 'book-info',
      label: '详情',
      icon: BookOpen,
      iconClass: 'w-5 h-5',
      onClick: props.onOpenBookInfo,
    },
  ]
}
