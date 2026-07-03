import type { ReaderRouteTarget } from '@/utils/readerRoute'
import type { ReaderSessionInitContext } from './session-types'

export function createReaderSessionStartAction(context: ReaderSessionInitContext) {
  return async function startReaderSession(target: ReaderRouteTarget) {
    context.options.settingsStore.applyAutoNightMode()

    try {
      const response = await context.options.readerStore.startReaderSession(
        target.sourceId,
        target.bookUrl
      )

      if (!response.isSuccess) {
        context.options.toast({
          title: response.errorMsg || '获取书籍信息失败',
          variant: 'destructive',
        })
      }
    } catch {
      context.options.toast({
        title: '加载书籍失败',
        variant: 'destructive',
      })
    }
  }
}
