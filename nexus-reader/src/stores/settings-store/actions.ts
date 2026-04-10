import type { SettingsStoreActions, SettingsStoreState, SettingsStoreView } from './types'
import { createSettingsClientRoutingActions } from './actions/client-routing'
import { createSettingsConfigActions } from './actions/config'
import { createSettingsStoreActionContext } from './actions/helpers'
import { createSettingsPersistenceActions } from './actions/persistence'
import { createSettingsSourcePackageActions } from './actions/source-packages'
import { createSettingsUiActions } from './actions/ui'

export function createSettingsStoreActions(
  state: SettingsStoreState,
  view: SettingsStoreView
): SettingsStoreActions {
  const context = createSettingsStoreActionContext(state, view)
  const configActions = createSettingsConfigActions(context)
  const uiActions = createSettingsUiActions(context)
  const clientRoutingActions = createSettingsClientRoutingActions(context)
  const sourcePackageActions = createSettingsSourcePackageActions(context)
  const persistenceActions = createSettingsPersistenceActions(context)

  return {
    ...configActions,
    ...uiActions,
    ...clientRoutingActions,
    ...sourcePackageActions,
    ...persistenceActions,
  }
}
