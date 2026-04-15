import { onUnmounted } from 'vue'
import type { ReaderSessionLifecycleContext } from './session-lifecycle-context-types'

export function setupReaderSessionDisposeLifecycle(context: ReaderSessionLifecycleContext) {
  onUnmounted(() => {
    context.options.readerStore.disposeReader()
  })
}
