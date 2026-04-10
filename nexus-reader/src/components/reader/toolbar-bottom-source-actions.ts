import { ArrowLeftRight } from 'lucide-vue-next'
import type { ReaderToolbarBottomAction } from './toolbar-bottom-action-contract-types'
import type { ReaderToolbarBottomActionsEmitFn } from './toolbar-bottom-action-emit-types'
import type { ReaderToolbarBottomActionsProps } from './toolbar-bottom-action-prop-types'

export function createReaderToolbarBottomSourceActions(
  props: ReaderToolbarBottomActionsProps,
  emit: ReaderToolbarBottomActionsEmitFn
): ReaderToolbarBottomAction[] {
  return [
    {
      key: 'source-picker',
      label: '书源',
      icon: ArrowLeftRight,
      iconClass: 'w-5 h-5',
      activeClass: 'text-amber-500',
      isActive: Boolean(props.contentIssue),
      showIndicator: Boolean(props.contentIssue),
      indicatorClass: 'bg-amber-500',
      onClick: () => emit('openSourcePicker'),
    },
  ]
}
