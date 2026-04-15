import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useErrorHandler } from '@/composables/useErrorHandler'
import { useSettingsSourcePackages } from '@/composables/useSettingsSourcePackages'
import { useSettingsStore } from '@/stores/settings'

export function useSettingsView() {
  const router = useRouter()
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

  function navigateTo(path: string) {
    void router.push(path)
  }

  function goBack() {
    navigateTo('/')
  }

  onMounted(async () => {
    try {
      await refreshSourcePackages()
    } catch (cause) {
      handlePromiseError(cause, '加载书源包失败')
    }
  })

  return {
    sourcePackagesLoading,
    sourcePackageImporting,
    sourcePackageDetailLoading,
    sourcePackages,
    sourcePackageDetailSummary,
    refreshSourcePackages,
    importSourcePackage,
    selectSourcePackage,
    deleteSourcePackage,
    navigateTo,
    goBack,
  }
}
