import { nextTick } from 'vue'
import type { ReaderActionOptions } from './action-types'
import { restoreReaderRefreshPosition } from './action-scroll'

export function createReaderChapterRefreshAction(
  options: ReaderActionOptions,
) {
  return async function handleRefresh() {
    try {
      const scrollRatio = await options.readerStore.refreshChapter()
      await nextTick()
      restoreReaderRefreshPosition(scrollRatio)
    } catch (error) {
      options.toast({
        title: '刷新失败',
        description: error instanceof Error ? error.message : '章节刷新失败',
        duration: 3000,
      })
    }
  }
}
