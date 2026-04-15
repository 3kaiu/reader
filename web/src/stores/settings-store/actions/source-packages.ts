import { syncApi } from '@/api/sync'
import type { SettingsStoreActions } from '../types'
import type { SettingsStoreActionContext } from './helpers'

type SettingsSourcePackageActions = Pick<
  SettingsStoreActions,
  | 'refreshSourcePackages'
  | 'clearSourcePackages'
  | 'importSourcePackage'
  | 'deleteSourcePackage'
  | 'loadSourcePackageDetail'
  | 'clearSourcePackageDetail'
>

export function createSettingsSourcePackageActions(
  context: SettingsStoreActionContext
): SettingsSourcePackageActions {
  const { state } = context

  const refreshSourcePackages = async () => {
    state.sourcePackagesLoading.value = true
    try {
      const response = await syncApi.listSourcePackages()
      state.sourcePackages.value = response.isSuccess ? (response.data ?? []) : []
    } catch {
      state.sourcePackages.value = []
    } finally {
      state.sourcePackagesLoading.value = false
    }
  }

  const clearSourcePackages = () => {
    state.sourcePackages.value = []
  }

  const importSourcePackage = async (packageJson: string) => {
    state.sourcePackageImporting.value = true
    try {
      const response = await syncApi.importSourcePackage(packageJson)
      if (!response.isSuccess) {
        return false
      }
      await refreshSourcePackages()
      if (response.data?.sourceId) {
        await loadSourcePackageDetail(response.data.sourceId)
      }
      return true
    } catch {
      return false
    } finally {
      state.sourcePackageImporting.value = false
    }
  }

  const deleteSourcePackage = async (sourceId: string) => {
    try {
      const response = await syncApi.deleteSourcePackage(sourceId)
      if (!response.isSuccess) {
        return false
      }
      if (state.sourcePackageDetail.value?.source.id === sourceId) {
        state.sourcePackageDetail.value = null
      }
      await refreshSourcePackages()
      return true
    } catch {
      return false
    }
  }

  const loadSourcePackageDetail = async (sourceId: string) => {
    state.sourcePackageDetailLoading.value = true
    try {
      const response = await syncApi.getSourcePackage(sourceId)
      state.sourcePackageDetail.value = response.isSuccess ? (response.data ?? null) : null
    } catch {
      state.sourcePackageDetail.value = null
    } finally {
      state.sourcePackageDetailLoading.value = false
    }
  }

  const clearSourcePackageDetail = () => {
    state.sourcePackageDetail.value = null
  }

  return {
    refreshSourcePackages,
    clearSourcePackages,
    importSourcePackage,
    deleteSourcePackage,
    loadSourcePackageDetail,
    clearSourcePackageDetail,
  }
}
