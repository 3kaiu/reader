import { useConfirm } from '@/composables/useConfirm'
import { useMessage } from '@/composables/useMessage'
import { useSettingsStore } from '@/stores/settings'
import { useSourceStore } from '@/stores/source'

export function useSettingsSourcePackages() {
  const settingsStore = useSettingsStore()
  const sourceStore = useSourceStore()
  const { success, warning } = useMessage()
  const { confirm } = useConfirm()

  async function refreshSourcePackages() {
    await settingsStore.refreshSourcePackages()
  }

  async function importSourcePackage(packageJson: string) {
    try {
      JSON.parse(packageJson)
    } catch {
      warning('规则包 JSON 格式无效')
      return
    }

    const ok = await settingsStore.importSourcePackage(packageJson)
    if (ok) {
      await sourceStore.loadSources(true)
      success('源规则包已导入')
    } else {
      warning('源规则包导入失败')
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
      success('源规则包预览已生成')
    } else {
      warning('样本构建失败')
    }
  }

  async function importPreviewPackage() {
    const packageJson = settingsStore.sourceBuildPreviewSummary.packageJson
    if (!packageJson) {
      warning('当前没有可导入的预览包')
      return
    }
    await importSourcePackage(packageJson)
  }

  function clearBuildPreview() {
    settingsStore.clearSourceBuildPreview()
  }

  async function deleteSourcePackage(sourceId: string) {
    const confirmed = await confirm({
      title: '删除源规则包',
      description: `将删除 ${sourceId} 的规则包以及后端已注册的 source。`,
      variant: 'destructive',
    })
    if (!confirmed) {
      return
    }

    const ok = await settingsStore.deleteSourcePackage(sourceId)
    if (ok) {
      await sourceStore.loadSources(true)
      success('源规则包已删除')
    } else {
      warning('源规则包删除失败')
    }
  }

  return {
    refreshSourcePackages,
    importSourcePackage,
    selectSourcePackage,
    buildFromSamples,
    importPreviewPackage,
    clearBuildPreview,
    deleteSourcePackage,
  }
}
