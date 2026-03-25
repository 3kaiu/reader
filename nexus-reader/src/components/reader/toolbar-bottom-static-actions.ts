import {
  ArrowLeftRight,
  BookOpen,
  Eye,
  Moon,
  RotateCcw,
  Settings,
  Sun,
  Type,
} from 'lucide-vue-next'
import type {
  ReaderToolbarBottomAction,
  ReaderToolbarBottomActionsEmitFn,
  ReaderToolbarBottomActionsProps,
} from './toolbar-bottom-action-types'

export function createReaderToolbarBottomStaticActions(
  props: ReaderToolbarBottomActionsProps,
  emit: ReaderToolbarBottomActionsEmitFn,
) {
  const primaryActions: ReaderToolbarBottomAction[] = [
    {
      key: 'day-night',
      label: props.isNightMode ? '夜间' : '日间',
      icon: props.isNightMode ? Moon : Sun,
      iconClass: 'w-5 h-5',
      onClick: () => emit('toggleDayNight'),
    },
    {
      key: 'settings',
      label: '设置',
      icon: Type,
      iconClass: 'w-5 h-5',
      onClick: () => emit('toggleSettings'),
    },
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
    {
      key: 'refresh',
      label: '刷新',
      icon: RotateCcw,
      iconClass: 'w-5 h-5',
      onClick: () => emit('refresh'),
    },
    {
      key: 'eye-care',
      label: props.isEyeCareEnabled ? '护眼开' : '护眼',
      icon: Eye,
      iconClass: 'w-5 h-5',
      activeClass: 'text-green-500',
      isActive: props.isEyeCareEnabled,
      onClick: () => emit('toggleEyeCare'),
    },
  ]

  const trailingActions: ReaderToolbarBottomAction[] = [
    {
      key: 'zen-mode',
      label: '禅模式',
      icon: Settings,
      iconClass: 'w-5 h-5 text-primary',
      onClick: () => emit('toggleZenMode'),
    },
    {
      key: 'book-info',
      label: '详情',
      icon: BookOpen,
      iconClass: 'w-5 h-5',
      onClick: () => emit('openBookInfo'),
    },
  ]

  return {
    primaryActions,
    trailingActions,
  }
}
