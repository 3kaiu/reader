import type { ReaderSessionInitContext } from './session-types'

export function createReaderSessionInitializer(
  context: ReaderSessionInitContext,
) {
  return async function initReader() {
    const target = context.routeTarget.value
    if (!target) {
      context.options.toast({
        title: '缺少书籍信息',
        variant: 'destructive',
      })
      context.router.push('/')
      return
    }

    context.options.settingsStore.applyAutoNightMode()

    if (context.options.decoderAddonEnabled) {
      context.options.decoderStore.setCurrentBook(target.bookUrl)
    }

    try {
      const response = await context.options.readerStore.startReaderSession(
        target.sourceId,
        target.bookUrl,
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
