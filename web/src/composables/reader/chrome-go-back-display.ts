import type { ReaderChromeActionContext } from './chrome-context-types'
import type { ReaderChromeDisplayActions } from './chrome-display-action-types'

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
