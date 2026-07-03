import { onUnmounted } from 'vue'
import type { ReaderChromeLifecycleActions } from './chrome-types'

export function setupReaderChromeLifecycle(actions: ReaderChromeLifecycleActions) {
  onUnmounted(() => {
    actions.clearHideTimer()
  })
}
