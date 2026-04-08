import type { Router } from 'vue-router'
import type { Ref } from 'vue'
import {
  buildSourceBuilderFromSamples,
  clearSourceBuilderPreview,
  importSourceBuilderPreviewPackage,
  refreshSourceBuilderPackages,
  selectSourceBuilderPackage,
} from '@/composables/source-builder/sourceBuilderDebugViewActions'
import type { NxsSourcePackageDetail } from '@/api/sync'

type MessageHandler = (message: string) => void

type BuildFromSamplesOptions = Parameters<typeof buildSourceBuilderFromSamples>[0]

type ImportPreviewOptions = {
  currentPackage: Ref<NxsSourcePackageDetail | null>
  currentPackageJson: Ref<string>
  importSourcePackage: (sourcePackage: string) => Promise<boolean>
  success: MessageHandler
  warning: MessageHandler
}

type SelectPackageOptions = {
  loadSourcePackageDetail: (sourceId: string) => Promise<void>
}

type ClearPreviewOptions = Parameters<typeof clearSourceBuilderPreview>[0]

type PageActionsOptions = {
  router: Router
  refreshSourcePackages: () => Promise<void>
  refreshRuntimeGovernance: () => Promise<void>
  buildFromSamplesOptions: BuildFromSamplesOptions
  importPreviewOptions: ImportPreviewOptions
  selectPackageOptions: SelectPackageOptions
  clearPreviewOptions: ClearPreviewOptions
}

export function useSourceBuilderDebugPageActions({
  router,
  refreshSourcePackages,
  refreshRuntimeGovernance,
  buildFromSamplesOptions,
  importPreviewOptions,
  selectPackageOptions,
  clearPreviewOptions,
}: PageActionsOptions) {
  async function refreshPackages() {
    await refreshSourceBuilderPackages({
      refreshRuntimeGovernance,
      refreshSourcePackages,
    })
  }

  async function buildFromSamples() {
    return await buildSourceBuilderFromSamples(buildFromSamplesOptions)
  }

  async function importPreviewPackage() {
    await importSourceBuilderPreviewPackage({
      currentPackage: importPreviewOptions.currentPackage,
      currentPackageJson: importPreviewOptions.currentPackageJson,
      importSourcePackage: importPreviewOptions.importSourcePackage,
      refreshPackages,
      success: importPreviewOptions.success,
      warning: importPreviewOptions.warning,
    })
  }

  async function selectPackage(sourceId: string) {
    await selectSourceBuilderPackage({
      sourceId,
      loadSourcePackageDetail: selectPackageOptions.loadSourcePackageDetail,
    })
  }

  function clearPreview() {
    clearSourceBuilderPreview(clearPreviewOptions)
  }

  function goBack() {
    void router.push('/settings')
  }

  return {
    refreshPackages,
    buildFromSamples,
    importPreviewPackage,
    selectPackage,
    clearPreview,
    goBack,
  }
}
