import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useConfirm } from '@/composables/useConfirm'
import { useErrorHandler } from '@/composables/useErrorHandler'
import { useMessage } from '@/composables/useMessage'
import { useSettingsMaintenance } from '@/composables/useSettingsMaintenance'
import { useSettingsSourcePackages } from '@/composables/useSettingsSourcePackages'
import { useSettingsStore } from '@/stores/settings'

export function useSettingsView() {
  const router = useRouter()
  const { confirm } = useConfirm()
  const { success } = useMessage()
  const { handlePromiseError } = useErrorHandler()
  const settingsStore = useSettingsStore()
  const { refreshSourcePackages, importSourcePackage, selectSourcePackage, deleteSourcePackage } =
    useSettingsSourcePackages()
  const {
    sourcePackagesLoading,
    sourcePackageImporting,
    sourcePackageDetailLoading,
    sourcePackages,
    sourcePackageDetailSummary,
  } = storeToRefs(settingsStore)
  const { storageUsage, exportDataBackup, hydrateSettingsDashboard, clearAppData } =
    useSettingsMaintenance()

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
      description: '确定清除当前应用的本地缓存与设置吗？不会影响浏览器中其他站点的数据。',
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

  function navigateTo(path: string) {
    void router.push(path)
  }

  function goBack() {
    navigateTo('/')
  }

  onMounted(async () => {
    await hydrateSettingsDashboard()
  })

  return {
    storageUsage,
    sourcePackagesLoading,
    sourcePackageImporting,
    sourcePackageDetailLoading,
    sourcePackages,
    sourcePackageDetailSummary,
    handleExportData,
    handleClearCache,
    refreshSourcePackages,
    importSourcePackage,
    selectSourcePackage,
    deleteSourcePackage,
    navigateTo,
    goBack,
  }
}
