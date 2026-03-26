import type { ReaderChromeActionContext } from './chrome-context-types'
import type { ReaderChromeDisplayActions } from './chrome-display-action-types'

export function createReaderChromePanelOpenDisplayActions(
  context: ReaderChromeActionContext,
): Pick<
  ReaderChromeDisplayActions,
  'openSourcePicker' | 'openBookInfo' | 'openDecoderSettings'
> {
  const openSourcePicker = () => {
    context.state.showSourcePicker.value = true
  }

  const openBookInfo = () => {
    context.state.showBookInfo.value = true
  }

  const openDecoderSettings = () => {
    context.state.showDecoderSettings.value = true
  }

  return {
    openSourcePicker,
    openBookInfo,
    openDecoderSettings,
  }
}
