import { computed } from 'vue'
import type { ReaderContentProps } from './reader-content-prop-types'
import type { ReaderScrollContentProps } from './reader-scroll-content-prop-types'

type ReaderContentScrollBindingOptions =
  Pick<
    ReaderScrollContentProps,
    'highlightContent' | 'handleContentClick'
  >

export function createReaderContentScrollBindings(
  props: ReaderContentProps,
  options: ReaderContentScrollBindingOptions,
) {
  return computed<ReaderScrollContentProps>(() => ({
    contentStyle: props.contentStyle,
    loadedChapters: props.loadedChapters,
    isParsing: props.isParsing,
    isLoadingMore: props.isLoadingMore,
    hasNextChapter: props.hasNextChapter,
    paragraphSpacing: props.paragraphSpacing,
    loadError: props.loadError,
    loadErrorDetails: props.loadErrorDetails,
    highlightContent: options.highlightContent,
    handleContentClick: options.handleContentClick,
  }))
}
