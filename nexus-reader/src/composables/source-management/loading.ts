import { downloadJsonFile } from '@/utils/download'
import type { SourceListItem } from '@/stores/source'
import type { SourceManagementContext } from './types'

export function createSourceLoadingActions(
  context: SourceManagementContext,
) {
  async function loadSources() {
    context.options.clearSelection()

    try {
      const response = await context.sourceStore.loadSources(true)
      if (!response.isSuccess) {
        context.error(response.errorMsg || '加载书源失败')
      }
    } catch {
      context.error('加载书源失败')
    }
  }

  async function toggleEnable(source: SourceListItem, enabled: boolean) {
    try {
      const response = await context.sourceStore.setSourceEnabled(source.id, enabled)
      if (response.isSuccess) {
        context.success(enabled ? '已启用书源' : '已禁用书源')
        return
      }

      context.error(response.errorMsg || '更新书源状态失败')
    } catch (cause) {
      context.handlePromiseError(cause, '更新书源状态失败')
    }
  }

  async function saveRuntimeSnapshot() {
    try {
      const response = await context.sourceStore.saveRuntimeSnapshot()
      if (!response.isSuccess || !response.data) {
        context.error(response.errorMsg || '保存运行时快照失败')
        return
      }

      await context.sourceStore.loadSources(true)
      context.success(
        `快照已保存 · 健康源 ${response.data.healthSources} · 提取源 ${response.data.extractionSources}`
      )
    } catch (cause) {
      context.handlePromiseError(cause, '保存运行时快照失败')
    }
  }

  async function exportRuntimeSnapshot() {
    try {
      const response = await context.sourceStore.exportRuntimeSnapshot()
      if (!response.isSuccess || !response.data) {
        context.error(response.errorMsg || '导出治理快照失败')
        return
      }

      downloadJsonFile(`source-runtime-snapshot_${Date.now()}.json`, response.data)
      context.success(
        `已导出治理快照 · 健康源 ${response.data.healthSources} · 提取源 ${response.data.extractionSources}`
      )
    } catch (cause) {
      context.handlePromiseError(cause, '导出治理快照失败')
    }
  }

  async function importRuntimeSnapshot() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) {
        return
      }

      try {
        const text = await file.text()
        const payload = JSON.parse(text) as Parameters<
          typeof context.sourceStore.importRuntimeSnapshot
        >[0]
        const response = await context.sourceStore.importRuntimeSnapshot(payload)
        if (!response.isSuccess || !response.data) {
          context.error(response.errorMsg || '导入治理快照失败')
          return
        }

        await context.sourceStore.loadSources(true)
        context.success(
          `已导入治理快照 · 健康源 ${response.data.healthSources} · 提取源 ${response.data.extractionSources}`
        )
      } catch (cause) {
        context.handlePromiseError(cause, '导入治理快照失败')
      }
    }
    input.click()
  }

  return {
    loadSources,
    toggleEnable,
    saveRuntimeSnapshot,
    exportRuntimeSnapshot,
    importRuntimeSnapshot,
  }
}
