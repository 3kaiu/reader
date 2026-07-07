// ─── Fullscreen ───────────────────────────────────────────

import { computed } from 'vue'

const ENTER_FULLSCREEN_PATH =
  'M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4'

const EXIT_FULLSCREEN_PATH =
  'M9 9V4H4m0 0l5 5M9 20v-5H4m0 0l5-5m11 0l-5-5m5 0v5h-5m5 10l-5-5m5 0v5h-5'

type ReaderFullscreenIconProps = {
  isFullscreen: boolean
}

export function createReaderFullscreenIconViewBindings(
  props: ReaderFullscreenIconProps
) {
  return {
    pathData: computed(() => (props.isFullscreen ? EXIT_FULLSCREEN_PATH : ENTER_FULLSCREEN_PATH)),
  }
}

// ─── Fullscreen Time ─────────────────────────────────────

export interface ReaderFullscreenTimeProps {
  formattedTime: string
}

export function createReaderFullscreenTimeViewBindings(
  props: ReaderFullscreenTimeProps
) {
  return {
    displayTime: computed(() => props.formattedTime),
  }
}

// ─── Gesture ────────────────────────────────────────────

export type ReaderGestureEmits = {
  'toggle-toolbar': []
  'toggle-zen-mode': []
}