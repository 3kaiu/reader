import { computed } from 'vue'
import type { ReaderScrollContentProps } from './reader-scroll-content-prop-types'

export function createReaderScrollContentStyleBindings(
  props: Pick<ReaderScrollContentProps, 'contentStyle' | 'paragraphSpacing'>,
) {
  return computed(() => ({
    ...props.contentStyle,
    '--p-spacing': `${props.paragraphSpacing}em`,
    '--p-line-height': props.contentStyle.lineHeight,
  }))
}
