import type { ReaderSessionInitContext } from './session-types'

export function createReaderSessionMissingTargetHandler(context: ReaderSessionInitContext) {
  return function handleMissingTarget() {
    context.options.toast({
      title: '缺少书籍信息',
      variant: 'destructive',
    })
    context.router.push('/')
  }
}
