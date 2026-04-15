import type { ReaderChromeActionContext } from './chrome-context-types'
import type { ReaderChromeDisplayActions } from './chrome-display-action-types'

export function createReaderChromeZenModeDisplayActions(
  context: ReaderChromeActionContext
): Pick<ReaderChromeDisplayActions, 'toggleZenMode'> {
  const toggleZenMode = () => {
    const nextState = !context.options.settingsStore.config.zenMode
    context.options.settingsStore.updateConfig('zenMode', nextState)

    if (nextState) {
      context.state.showToolbar.value = false
      context.state.showSettings.value = false
      context.state.showCatalog.value = false
      context.options.toast({
        title: '已进入禅模式',
        description: '所有界面已隐藏，双击中央区域退出',
        duration: 3000,
      })
      return
    }

    context.options.toast({ title: '已退出禅模式', duration: 2000 })
  }

  return {
    toggleZenMode,
  }
}
