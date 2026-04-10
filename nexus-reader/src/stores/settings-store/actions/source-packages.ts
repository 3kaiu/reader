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
  | 'buildSourcePackageFromSamples'
  | 'clearSourceBuildPreview'
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

  const buildSourcePackageFromSamples = async (payload: {
    bookCurl: string
    chapterCurl: string
    searchCurl?: string
    siteEntryCurl?: string
    searchKeyword?: string
    sourceId?: string
    sourceName?: string
    tags?: string[]
    fetchMode?: string
    fetchProvider?: string
    fetchServiceUrl?: string
    fetchEngine?: string
    fetchSessionKey?: string
    structuredHints?: import('@/api/sync').SourceRuleHints
    freeTextHints?: string
  }) => {
    state.sourceBuildRunning.value = true
    try {
      const response = await syncApi.buildSourcePackageFromSamples({
        ...payload,
        emitPackageJson: true,
      })
      if (!response.isSuccess || !response.data) {
        state.sourceBuildPreview.value = null
        return false
      }
      state.sourceBuildPreview.value = response.data
      return true
    } catch {
      state.sourceBuildPreview.value = null
      return false
    } finally {
      state.sourceBuildRunning.value = false
    }
  }

  const clearSourceBuildPreview = () => {
    state.sourceBuildPreview.value = null
  }

  return {
    refreshSourcePackages,
    clearSourcePackages,
    importSourcePackage,
    deleteSourcePackage,
    loadSourcePackageDetail,
    clearSourcePackageDetail,
    buildSourcePackageFromSamples,
    clearSourceBuildPreview,
  }
}
