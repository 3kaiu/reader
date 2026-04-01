import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { ADDON_ENTRY_CARDS } from '@/constants/addons'
import { useConfirm } from '@/composables/useConfirm'
import { useErrorHandler } from '@/composables/useErrorHandler'
import { useMessage } from '@/composables/useMessage'
import { useSettingsMaintenance } from '@/composables/useSettingsMaintenance'
import { useAddonsStore } from '@/stores/addons'
import { useSettingsStore } from '@/stores/settings'
import { useSourceStore } from '@/stores/source'
import type { AgentRouterConfigPatch } from '@/api/sync'
import { isOptionalFeature, type OptionalFeature } from '@/utils/features'

export function useSettingsView() {
  const router = useRouter()
  const route = useRoute()
  const { success, warning } = useMessage()
  const { confirm } = useConfirm()
  const { handlePromiseError } = useErrorHandler()
  const addonsStore = useAddonsStore()
  const settingsStore = useSettingsStore()
  const sourceStore = useSourceStore()
  const {
    features: addonFeatures,
  } = storeToRefs(addonsStore)
  const {
    clientRoutingLoading,
    clientRoutingSummary,
    agentRoutingLoading,
    agentRoutingSummary,
    agentConfigLoading,
    agentConfigSaving,
    agentConfigAuditLoading,
    agentRoutingConfigSummary,
    agentRoutingConfigRaw,
    agentRoutingAuditSummary,
    sourcePackagesLoading,
    sourcePackageImporting,
    sourcePackageDetailLoading,
    sourceBuildRunning,
    sourcePackages,
    sourcePackageDetailSummary,
    sourceBuildPreviewSummary,
  } = storeToRefs(settingsStore)
  const {
    storageUsage,
    exportDataBackup,
    hydrateSettingsDashboard,
    clearAppData,
  } = useSettingsMaintenance()

  const addonEntryCards = computed(() =>
    ADDON_ENTRY_CARDS.filter(item => addonsStore.isEnabled(item.feature))
  )

  async function handleExportData() {
    try {
      await exportDataBackup()
      success('备份导出成功')
    } catch (cause) {
      handlePromiseError(cause, '导出失败')
    }
  }

  async function handleClearCache() {
    const confirmed = await confirm({
      title: '确认清除缓存',
      description:
        '确定清除当前应用的本地缓存与设置吗？不会影响浏览器中其他站点的数据。',
      variant: 'destructive',
    })
    if (!confirmed) {
      return
    }

    try {
      await clearAppData()
      success('应用本地缓存已清理')
    } catch (cause) {
      handlePromiseError(cause, '清理缓存失败')
    }
  }

  function updateAddonFeature(feature: OptionalFeature, enabled: boolean) {
    addonsStore.setFeatureEnabled(feature, enabled)
    success(enabled ? `已启用${feature}附属模块` : `已关闭${feature}附属模块`)
  }

  function navigateTo(path: string) {
    void router.push(path)
  }

  function goBack() {
    navigateTo('/')
  }

  async function refreshClientRouting() {
    await Promise.allSettled([
      settingsStore.refreshClientRouting(),
      settingsStore.refreshAgentRouting(),
      settingsStore.refreshAgentConfig(),
      settingsStore.refreshAgentConfigAudit(20),
    ])
  }

  async function refreshSourcePackages() {
    await settingsStore.refreshSourcePackages()
  }

  async function loadMoreAgentAudit() {
    await settingsStore.loadMoreAgentConfigAudit(20)
  }

  async function importSourcePackage(packageJson: string) {
    try {
      JSON.parse(packageJson)
    } catch {
      warning("规则包 JSON 格式无效")
      return
    }

    const ok = await settingsStore.importSourcePackage(packageJson)
    if (ok) {
      await sourceStore.loadSources(true)
      success("源规则包已导入")
    } else {
      warning("源规则包导入失败")
    }
  }

  async function selectSourcePackage(sourceId: string) {
    await settingsStore.loadSourcePackageDetail(sourceId)
  }

  async function buildFromSamples(payload: {
    bookCurl: string
    chapterCurl: string
    sourceId?: string
    sourceName?: string
    tags?: string[]
  }) {
    const ok = await settingsStore.buildSourcePackageFromSamples(payload)
    if (ok) {
      success("源规则包预览已生成")
    } else {
      warning("样本构建失败")
    }
  }

  async function importPreviewPackage() {
    const packageJson = settingsStore.sourceBuildPreviewSummary.packageJson
    if (!packageJson) {
      warning("当前没有可导入的预览包")
      return
    }
    await importSourcePackage(packageJson)
  }

  function clearBuildPreview() {
    settingsStore.clearSourceBuildPreview()
  }

  async function deleteSourcePackage(sourceId: string) {
    const confirmed = await confirm({
      title: "删除源规则包",
      description: `将删除 ${sourceId} 的规则包以及后端已注册的 source。`,
      variant: "destructive",
    })
    if (!confirmed) {
      return
    }

    const ok = await settingsStore.deleteSourcePackage(sourceId)
    if (ok) {
      await sourceStore.loadSources(true)
      success("源规则包已删除")
    } else {
      warning("源规则包删除失败")
    }
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

  onMounted(async () => {
    const requestedAddon =
      typeof route.query.addon === 'string' ? route.query.addon : null

    if (
      requestedAddon &&
      isOptionalFeature(requestedAddon) &&
      !addonFeatures.value[requestedAddon]
    ) {
      warning('该功能已从主阅读链路下沉为可选模块，可在设置页手动启用。')
    }

    await hydrateSettingsDashboard()
  })

  return {
    addonFeatures,
    storageUsage,
    addonEntryCards,
    clientRoutingLoading,
    clientRoutingSummary,
    agentRoutingLoading,
    agentRoutingSummary,
    agentConfigLoading,
    agentConfigSaving,
    agentConfigAuditLoading,
    agentRoutingConfigSummary,
    agentRoutingConfigRaw,
    agentRoutingAuditSummary,
    sourcePackagesLoading,
    sourcePackageImporting,
    sourcePackageDetailLoading,
    sourceBuildRunning,
    sourcePackages,
    sourcePackageDetailSummary,
    sourceBuildPreviewSummary,
    handleExportData,
    handleClearCache,
    updateAddonFeature,
    refreshClientRouting,
    refreshSourcePackages,
    setAgentConfigDisabled,
    setAgentConfigShadow,
    setAgentConfigCanary,
    saveAgentConfigCustom,
    resetAgentConfigOverride,
    loadMoreAgentAudit,
    importSourcePackage,
    buildFromSamples,
    importPreviewPackage,
    clearBuildPreview,
    selectSourcePackage,
    deleteSourcePackage,
    navigateTo,
    goBack,
  }
}
