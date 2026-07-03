import type { ReaderChromeActionContext } from './chrome-types'
import type { ReaderChromeDisplayActions } from './chrome-types'

export function createReaderChromeGoBackDisplayAction(
  context: ReaderChromeActionContext
): Pick<ReaderChromeDisplayActions, 'goBack'> {
  const goBack = () => {
    void context.options.router.push('/')
  }

  return {
    goBack,
  }
}
