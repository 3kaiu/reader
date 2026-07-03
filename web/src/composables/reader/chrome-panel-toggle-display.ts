import type { ReaderChromeActionContext } from './chrome-types'
import type { ReaderChromeDisplayActions } from './chrome-types'

export function createReaderChromePanelToggleDisplayActions(
  context: ReaderChromeActionContext
): Pick<
  ReaderChromeDisplayActions,
  'toggleCatalog' | 'openCatalog' | 'toggleSettings' | 'openSettings' | 'toggleKeyboardHelp'
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

  return {
    toggleCatalog,
    openCatalog,
    toggleSettings,
    openSettings,
    toggleKeyboardHelp,
  }
}
