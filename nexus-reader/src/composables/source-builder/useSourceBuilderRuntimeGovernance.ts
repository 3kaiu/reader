import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { useMessage } from '@/composables/useMessage'
import { sourceApi } from '@/api/source'
import { useSourceStore } from '@/stores/source'
import type { RuntimeStateOverviewResponse, SourceHealthSummary } from '@/types/source'
import type { NxsSourcePackageDetail } from '@/api/sync'
import { downloadJsonFile } from '@/utils/download'
import { buildSourceGovernanceSuggestions } from '@/utils/sourceGovernanceSuggestions'

type UseSourceBuilderRuntimeGovernanceOptions = {
  currentPackage: ComputedRef<NxsSourcePackageDetail | null>
  sourceId: Ref<string>
}

export function useSourceBuilderRuntimeGovernance(
  options: UseSourceBuilderRuntimeGovernanceOptions
) {
  const { success, warning } = useMessage()
  const sourceStore = useSourceStore()

  const runtimeOverview = ref<RuntimeStateOverviewResponse | null>(null)
  const runtimeGovernanceLoading = ref(false)
  const runtimeGovernanceActionLoading = ref(false)

  const currentRuntimeSourceId = computed(() => {
    if (options.currentPackage.value?.source?.id) {
      return options.currentPackage.value.source.id
    }
    const manual = options.sourceId.value.trim()
    return manual || ''
  })

  const currentRuntimeSourceHealth = computed<SourceHealthSummary | null>(() => {
    const targetId = currentRuntimeSourceId.value
    if (!targetId) {
      return null
    }
    const item = sourceStore.sources.find(source => source.id === targetId)
    return item?.health || null
  })

  const currentRuntimeGovernanceSummary = computed(() => {
    const health = currentRuntimeSourceHealth.value
    if (!health) {
      return []
    }
    const items = [
      `score: ${Math.round((health.score || 0) * 100)}`,
      `latency: ${health.avgLatencyMs || 0}ms`,
      `primary failure: ${health.primaryFailure || 'none'}`,
      `circuit: ${health.circuitState || 'closed'}`,
      `health points: ${health.healthPoints ?? 0}`,
      `consecutive failures: ${health.consecutiveFailures ?? 0}`,
      `fallback hit rate: ${Math.round((health.fallbackHitRate || 0) * 100)}%`,
      `avg quality score: ${Math.round((health.avgQualityScore || 0) * 100)}%`,
      `health events since snapshot: ${health.healthEventsSinceSnapshot ?? 0}`,
      `extraction events since snapshot: ${health.extractionEventsSinceSnapshot ?? 0}`,
      `confidence: ${health.lowConfidence ? 'low' : 'live'}`,
    ]

    if (health.restoredFromSnapshot && health.snapshotUpdatedAtMs) {
      items.push(`snapshot: ${new Date(health.snapshotUpdatedAtMs).toLocaleString()}`)
    }
    return items
  })

  const runtimeOverviewSummary = computed(() => {
    const overview = runtimeOverview.value
    if (!overview) {
      return []
    }
    const items = [
      `tracked: ${overview.trackedSources}`,
      `unhealthy: ${overview.unhealthySources}`,
      `open circuit: ${overview.openCircuitSources}`,
      `low confidence: ${overview.lowConfidenceSources}`,
      `health delta: ${overview.healthEventsSinceSnapshot}`,
      `extraction delta: ${overview.extractionEventsSinceSnapshot}`,
      `restored: ${overview.restoredFromSnapshot ? 'yes' : 'no'}`,
    ]
    if (overview.snapshotUpdatedAtMs) {
      items.push(`snapshot: ${new Date(overview.snapshotUpdatedAtMs).toLocaleString()}`)
    }
    return items
  })

  const runtimeGovernanceSuggestions = computed(() => {
    return buildSourceGovernanceSuggestions(currentRuntimeSourceHealth.value).map(
      item => `${item.title}：${item.detail}`,
    )
  })

  async function refreshRuntimeGovernance() {
    runtimeGovernanceLoading.value = true
    try {
      const [overviewResponse] = await Promise.all([
        sourceApi.getRuntimeStateOverview(),
        sourceStore.loadSources(true),
      ])
      runtimeOverview.value = overviewResponse.isSuccess ? overviewResponse.data || null : null
    } finally {
      runtimeGovernanceLoading.value = false
    }
  }

  async function saveRuntimeSnapshot() {
    runtimeGovernanceActionLoading.value = true
    try {
      const response = await sourceStore.saveRuntimeSnapshot()
      if (!response.isSuccess || !response.data) {
        warning(response.errorMsg || '保存运行时快照失败')
        return
      }
      await refreshRuntimeGovernance()
      success(`快照已保存 · 健康源 ${response.data.healthSources} · 提取源 ${response.data.extractionSources}`)
    } finally {
      runtimeGovernanceActionLoading.value = false
    }
  }

  async function exportRuntimeSnapshot() {
    runtimeGovernanceActionLoading.value = true
    try {
      const response = await sourceStore.exportRuntimeSnapshot()
      if (!response.isSuccess || !response.data) {
        warning(response.errorMsg || '导出治理快照失败')
        return
      }
      downloadJsonFile(`source-runtime-snapshot_${Date.now()}.json`, response.data)
      success('治理快照已导出')
    } finally {
      runtimeGovernanceActionLoading.value = false
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

      runtimeGovernanceActionLoading.value = true
      try {
        const text = await file.text()
        const payload = JSON.parse(text) as Parameters<
          typeof sourceStore.importRuntimeSnapshot
        >[0]
        const response = await sourceStore.importRuntimeSnapshot(payload)
        if (!response.isSuccess || !response.data) {
          warning(response.errorMsg || '导入治理快照失败')
          return
        }
        await refreshRuntimeGovernance()
        success(
          `已导入治理快照 · 健康源 ${response.data.healthSources} · 提取源 ${response.data.extractionSources}`
        )
      } catch {
        warning('导入治理快照失败')
      } finally {
        runtimeGovernanceActionLoading.value = false
      }
    }
    input.click()
  }

  async function resetCurrentRuntimeState(mode: 'full' | 'circuit_only' = 'full') {
    const targetId = currentRuntimeSourceId.value
    if (!targetId) {
      warning('当前没有可操作的 source id')
      return
    }
    runtimeGovernanceActionLoading.value = true
    try {
      const response = await sourceStore.resetSourceRuntimeState(targetId, mode)
      if (!response.isSuccess) {
        warning(response.errorMsg || '重置运行时状态失败')
        return
      }
      await refreshRuntimeGovernance()
      success(mode === 'circuit_only' ? '已重置熔断状态' : '已全量重置治理状态')
    } finally {
      runtimeGovernanceActionLoading.value = false
    }
  }

  return {
    runtimeOverview,
    runtimeGovernanceLoading,
    runtimeGovernanceActionLoading,
    currentRuntimeSourceId,
    currentRuntimeSourceHealth,
    currentRuntimeGovernanceSummary,
    runtimeOverviewSummary,
    runtimeGovernanceSuggestions,
    refreshRuntimeGovernance,
    saveRuntimeSnapshot,
    exportRuntimeSnapshot,
    importRuntimeSnapshot,
    resetCurrentRuntimeState,
  }
}
