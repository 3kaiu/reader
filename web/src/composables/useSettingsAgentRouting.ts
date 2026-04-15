import type { AgentRouterConfigPatch } from '@/api/sync'
import { useConfirm } from '@/composables/useConfirm'
import { useMessage } from '@/composables/useMessage'
import { useSettingsStore } from '@/stores/settings'

export function useSettingsAgentRouting() {
  const settingsStore = useSettingsStore()
  const { success, warning } = useMessage()
  const { confirm } = useConfirm()

  async function refreshClientRouting() {
    await Promise.allSettled([
      settingsStore.refreshClientRouting(),
      settingsStore.refreshAgentRouting(),
      settingsStore.refreshAgentConfig(),
      settingsStore.refreshAgentConfigAudit(20),
    ])
  }

  async function loadMoreAgentAudit() {
    await settingsStore.loadMoreAgentConfigAudit(20)
  }

  async function setAgentConfigDisabled() {
    const ok = await settingsStore.updateAgentConfig({
      enabled: false,
      shadowMode: false,
      rolloutPercent: 0,
    })
    if (ok) {
      success('Agent 已关闭')
      await refreshClientRouting()
    } else {
      warning('Agent 配置更新失败')
    }
  }

  async function setAgentConfigShadow() {
    const ok = await settingsStore.updateAgentConfig({
      enabled: true,
      shadowMode: true,
      rolloutPercent: 100,
    })
    if (ok) {
      success('Agent 已切到 Shadow 全量观测')
      await refreshClientRouting()
    } else {
      warning('Agent 配置更新失败')
    }
  }

  async function setAgentConfigCanary() {
    const ok = await settingsStore.updateAgentConfig({
      enabled: true,
      shadowMode: false,
      rolloutPercent: 10,
    })
    if (ok) {
      success('Agent 已切到 10% Canary')
      await refreshClientRouting()
    } else {
      warning('Agent 配置更新失败')
    }
  }

  async function saveAgentConfigCustom(patch: AgentRouterConfigPatch) {
    const ok = await settingsStore.updateAgentConfig(patch)
    if (ok) {
      success('Agent 配置已更新')
      await refreshClientRouting()
    } else {
      warning('Agent 配置更新失败')
    }
  }

  async function resetAgentConfigOverride() {
    const confirmed = await confirm({
      title: '重置 Agent 覆盖配置',
      description: '将删除运行时覆盖配置并回退到 wrangler/env 里的默认值。',
      variant: 'destructive',
    })
    if (!confirmed) {
      return
    }

    const ok = await settingsStore.resetAgentConfig()
    if (ok) {
      success('已重置为环境配置')
      await refreshClientRouting()
    } else {
      warning('重置 Agent 配置失败')
    }
  }

  return {
    refreshClientRouting,
    loadMoreAgentAudit,
    setAgentConfigDisabled,
    setAgentConfigShadow,
    setAgentConfigCanary,
    saveAgentConfigCustom,
    resetAgentConfigOverride,
  }
}
