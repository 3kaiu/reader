import { syncApi } from '@/api/sync'
import type { SettingsStoreActions } from '../types'
import type { SettingsStoreActionContext } from './helpers'

type SettingsClientRoutingActions = Pick<
  SettingsStoreActions,
  | 'refreshClientRouting'
  | 'clearClientRouting'
  | 'refreshAgentRouting'
  | 'clearAgentRouting'
  | 'refreshAgentConfig'
  | 'clearAgentConfig'
  | 'updateAgentConfig'
  | 'resetAgentConfig'
  | 'refreshAgentConfigAudit'
  | 'loadMoreAgentConfigAudit'
  | 'clearAgentConfigAudit'
>

export function createSettingsClientRoutingActions(
  context: SettingsStoreActionContext
): SettingsClientRoutingActions {
  const { state } = context

  const refreshClientRouting = async () => {
    state.clientRoutingLoading.value = true

    try {
      const response = await syncApi.getClientRoutingAnalytics()
      state.clientRouting.value = response.isSuccess ? (response.data ?? null) : null
    } catch {
      state.clientRouting.value = null
    } finally {
      state.clientRoutingLoading.value = false
    }
  }

  const clearClientRouting = () => {
    state.clientRouting.value = null
  }

  const refreshAgentRouting = async () => {
    state.agentRoutingLoading.value = true

    try {
      const response = await syncApi.getAgentRouterStats()
      state.agentRouting.value = response.isSuccess ? (response.data ?? null) : null
    } catch {
      state.agentRouting.value = null
    } finally {
      state.agentRoutingLoading.value = false
    }
  }

  const clearAgentRouting = () => {
    state.agentRouting.value = null
  }

  const refreshAgentConfig = async () => {
    state.agentConfigLoading.value = true

    try {
      const response = await syncApi.getAgentRouterConfig()
      state.agentConfig.value = response.isSuccess ? (response.data ?? null) : null
    } catch {
      state.agentConfig.value = null
    } finally {
      state.agentConfigLoading.value = false
    }
  }

  const clearAgentConfig = () => {
    state.agentConfig.value = null
  }

  const updateAgentConfig = async (
    patch: Parameters<SettingsStoreActions['updateAgentConfig']>[0]
  ) => {
    state.agentConfigSaving.value = true
    try {
      const response = await syncApi.updateAgentRouterConfig(patch)
      if (!response.isSuccess || !response.data) {
        return false
      }
      const current = state.agentConfig.value
      state.agentConfig.value = {
        window: current?.window ?? 'runtime',
        source: 'env+override',
        overrideUpdatedAt: response.data.updatedAt,
        overrideUpdatedBy: response.data.updatedBy ?? null,
        config: response.data.config,
      }
      return true
    } catch {
      return false
    } finally {
      state.agentConfigSaving.value = false
    }
  }

  const resetAgentConfig = async () => {
    state.agentConfigSaving.value = true
    try {
      const response = await syncApi.resetAgentRouterConfig()
      if (!response.isSuccess || !response.data) {
        return false
      }
      state.agentConfig.value = {
        window: 'runtime',
        source: 'env',
        overrideUpdatedAt: null,
        overrideUpdatedBy: null,
        config: response.data.config,
      }
      return true
    } catch {
      return false
    } finally {
      state.agentConfigSaving.value = false
    }
  }

  const refreshAgentConfigAudit = async (limit = 20) => {
    state.agentConfigAuditLoading.value = true
    try {
      const response = await syncApi.getAgentRouterConfigAudit(limit, null)
      if (!response.isSuccess || !response.data) {
        state.agentConfigAudit.value = []
        state.agentConfigAuditNextCursor.value = null
        state.agentConfigAuditHasMore.value = false
        return
      }
      state.agentConfigAudit.value = response.data.records ?? []
      state.agentConfigAuditNextCursor.value = response.data.nextCursor ?? null
      state.agentConfigAuditHasMore.value = Boolean(response.data.nextCursor)
    } catch {
      state.agentConfigAudit.value = []
      state.agentConfigAuditNextCursor.value = null
      state.agentConfigAuditHasMore.value = false
    } finally {
      state.agentConfigAuditLoading.value = false
    }
  }

  const loadMoreAgentConfigAudit = async (limit = 20) => {
    if (!state.agentConfigAuditHasMore.value || !state.agentConfigAuditNextCursor.value) {
      return
    }
    state.agentConfigAuditLoading.value = true
    try {
      const response = await syncApi.getAgentRouterConfigAudit(
        limit,
        state.agentConfigAuditNextCursor.value
      )
      if (!response.isSuccess || !response.data) {
        return
      }
      const existingIds = new Set(state.agentConfigAudit.value.map(item => item.id))
      const appended = (response.data.records ?? []).filter(item => !existingIds.has(item.id))
      state.agentConfigAudit.value = [...state.agentConfigAudit.value, ...appended]
      state.agentConfigAuditNextCursor.value = response.data.nextCursor ?? null
      state.agentConfigAuditHasMore.value = Boolean(response.data.nextCursor)
    } finally {
      state.agentConfigAuditLoading.value = false
    }
  }

  const clearAgentConfigAudit = () => {
    state.agentConfigAudit.value = []
    state.agentConfigAuditNextCursor.value = null
    state.agentConfigAuditHasMore.value = false
  }

  return {
    refreshClientRouting,
    clearClientRouting,
    refreshAgentRouting,
    clearAgentRouting,
    refreshAgentConfig,
    clearAgentConfig,
    updateAgentConfig,
    resetAgentConfig,
    refreshAgentConfigAudit,
    loadMoreAgentConfigAudit,
    clearAgentConfigAudit,
  }
}
