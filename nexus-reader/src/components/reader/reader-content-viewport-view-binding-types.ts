import type { ComputedRef } from 'vue'
import type { ReaderFullscreenTimeProps } from './reader-fullscreen-time-prop-types'

export interface ReaderContentViewportViewBindings {
  showFullscreenTime: ComputedRef<boolean>
  fullscreenTimeProps: ComputedRef<ReaderFullscreenTimeProps>
  onLoadNextChapter: () => void
  onRetryLoad: () => void
}
