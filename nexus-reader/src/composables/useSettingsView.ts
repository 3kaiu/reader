import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { ADDON_ENTRY_CARDS } from '@/constants/addons'
import { useConfirm } from '@/composables/useConfirm'
import { useErrorHandler } from '@/composables/useErrorHandler'
import { useMessage } from '@/composables/useMessage'
import { useSettingsAgentRouting } from '@/composables/useSettingsAgentRouting'
import { useSettingsMaintenance } from '@/composables/useSettingsMaintenance'
import { useSettingsSourcePackages } from '@/composables/useSettingsSourcePackages'
import { useAddonsStore } from '@/stores/addons'
import { useSettingsStore } from '@/stores/settings'
import { isOptionalFeature, type OptionalFeature } from '@/utils/features'

export function useSettingsView() {
  const router = useRouter()
  const route = useRoute()
  const { confirm } = useConfirm()
  const { success, warning } = useMessage()
  const { handlePromiseError } = useErrorHandler()
  const addonsStore = useAddonsStore()
  const settingsStore = useSettingsStore()
  const {
    refreshClientRouting,
    loadMoreAgentAudit,
    setAgentConfigDisabled,
    setAgentConfigShadow,
    setAgentConfigCanary,
    saveAgentConfigCustom,
    resetAgentConfigOverride,
  } = useSettingsAgentRouting()
  const {
    refreshSourcePackages,
    importSourcePackage,
    selectSourcePackage,
    deleteSourcePackage,
  } = useSettingsSourcePackages()
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
    sourcePackages,
    sourcePackageDetailSummary,
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
    sourcePackages,
    sourcePackageDetailSummary,
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
    selectSourcePackage,
    deleteSourcePackage,
    navigateTo,
    goBack,
  }
}
