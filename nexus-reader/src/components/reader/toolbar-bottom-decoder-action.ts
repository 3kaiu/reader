import {
  Loader2,
  Sparkles,
} from 'lucide-vue-next'
import type { ReaderToolbarBottomAction } from './toolbar-bottom-action-contract-types'
import type { ReaderToolbarBottomActionsEmitFn } from './toolbar-bottom-action-emit-types'
import type { ReaderToolbarBottomActionsProps } from './toolbar-bottom-action-prop-types'

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
