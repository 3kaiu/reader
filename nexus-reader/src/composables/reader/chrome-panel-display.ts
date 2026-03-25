import type { ReaderChromeActionContext } from './chrome-context-types'
import type { ReaderChromeDisplayActions } from './chrome-display-types'

export function createReaderChromePanelDisplayActions(
  context: ReaderChromeActionContext,
): Pick<
  ReaderChromeDisplayActions,
  | 'toggleCatalog'
  | 'openCatalog'
  | 'toggleSettings'
  | 'openSettings'
  | 'toggleKeyboardHelp'
  | 'openSourcePicker'
  | 'openBookInfo'
  | 'openDecoderSettings'
> {
  const toggleCatalog = () => {
    context.state.showCatalog.value = !context.state.showCatalog.value
  }

  const openCatalog = () => {
    context.state.showCatalog.value = true
  }

  const toggleSettings = () => {
    context.state.showSettings.value = !context.state.showSettings.value
  }

  const openSettings = () => {
    context.state.showSettings.value = true
  }

  const toggleKeyboardHelp = () => {
    context.state.showKeyboardHelp.value = !context.state.showKeyboardHelp.value
  }

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
    toggleCatalog,
    openCatalog,
    toggleSettings,
    openSettings,
    toggleKeyboardHelp,
    openSourcePicker,
    openBookInfo,
    openDecoderSettings,
  }
}
