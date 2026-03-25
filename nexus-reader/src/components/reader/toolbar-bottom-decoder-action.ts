import {
  Loader2,
  Sparkles,
} from 'lucide-vue-next'
import type {
  ReaderToolbarBottomAction,
  ReaderToolbarBottomActionsEmitFn,
  ReaderToolbarBottomActionsProps,
} from './toolbar-bottom-action-types'

export function createReaderToolbarBottomDecoderAction(
  props: ReaderToolbarBottomActionsProps,
  emit: ReaderToolbarBottomActionsEmitFn,
): ReaderToolbarBottomAction | null {
  if (!props.showDecoderAction) {
    return null
  }

  return {
    key: 'decoder',
    label: props.isDecoderEnabled ? '解密中' : '解密',
    icon: props.isDecoding ? Loader2 : Sparkles,
    iconClass: props.isDecoding ? 'w-5 h-5 animate-spin' : 'w-5 h-5',
    activeClass: 'text-purple-500',
    isActive: Boolean(props.isDecoderEnabled),
    showIndicator: Boolean(props.isDecoderEnabled && !props.isDecoding),
    indicatorClass: 'bg-purple-500',
    onClick: () => emit('toggleDecoder', !props.isDecoderEnabled),
    onContextmenu: () => emit('openDecoderSettings'),
  }
}
