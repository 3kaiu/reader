import type { ReaderChromeActionContext } from './chrome-types'
import type { ReaderChromeDisplayActions } from './chrome-types'

export function createReaderChromePanelOpenDisplayActions(
  context: ReaderChromeActionContext
): Pick<ReaderChromeDisplayActions, 'openSourcePicker' | 'openBookInfo'> {
  const openSourcePicker = () => {
    context.state.showSourcePicker.value = true
  }

  const openBookInfo = () => {
    context.state.showBookInfo.value = true
  }

  return {
    openSourcePicker,
    openBookInfo,
  }
}
