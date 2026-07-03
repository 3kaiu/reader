import type { ReaderChromeActionContext } from './chrome-types'
import type { ReaderChromeDisplayActions } from './chrome-types'
import { createReaderChromePanelOpenDisplayActions } from './chrome-panel-open-display'
import { createReaderChromePanelToggleDisplayActions } from './chrome-panel-toggle-display'

export function createReaderChromePanelDisplayActions(
  context: ReaderChromeActionContext
): Pick<
  ReaderChromeDisplayActions,
  | 'toggleCatalog'
  | 'openCatalog'
  | 'toggleSettings'
  | 'openSettings'
  | 'toggleKeyboardHelp'
  | 'openSourcePicker'
  | 'openBookInfo'
> {
  const toggles = createReaderChromePanelToggleDisplayActions(context)
  const opens = createReaderChromePanelOpenDisplayActions(context)

  return {
    ...toggles,
    ...opens,
  }
}
