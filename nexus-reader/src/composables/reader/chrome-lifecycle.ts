import { onUnmounted } from 'vue'

export function setupReaderChromeLifecycle(clearHideTimer: () => void) {
  onUnmounted(() => {
    clearHideTimer()
  })
}
