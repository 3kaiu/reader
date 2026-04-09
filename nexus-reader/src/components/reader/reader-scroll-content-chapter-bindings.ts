import { computed } from 'vue'
import type {
  ReaderScrollChapterListProps,
} from './reader-scroll-chapter-list-prop-types'
import type { ReaderScrollContentProps } from './reader-scroll-content-prop-types'

export function createReaderScrollChapterListBindings(
  props: Pick<
    ReaderScrollContentProps,
    | 'loadedChapters'
    | 'highlightContent'
    | 'handleContentClick'
    | 'contentStyle'
    | 'paragraphSpacing'
  >,
) {
  const layoutVersion = computed(() => {
    const contentStyle = props.contentStyle || {}
    return [
      contentStyle.fontFamily ?? '',
      contentStyle.fontSize ?? '',
      contentStyle.fontWeight ?? '',
      contentStyle.lineHeight ?? '',
      contentStyle.maxWidth ?? '',
      props.paragraphSpacing,
    ].join('|')
  })

  return computed<ReaderScrollChapterListProps>(() => ({
    loadedChapters: props.loadedChapters,
    layoutVersion: layoutVersion.value,
    highlightContent: props.highlightContent,
    handleContentClick: props.handleContentClick,
  }))
}
