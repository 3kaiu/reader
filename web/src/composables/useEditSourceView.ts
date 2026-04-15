import { computed, ref, watch } from 'vue'
import { useMessage } from '@/composables/useMessage'
import { useSourceStore } from '@/stores/source'
import { buildSourceGovernanceSuggestions } from '@/utils/sourceGovernanceSuggestions'
import type {
  BookSource,
  SourceAccessMode,
  SourceLicenseStatus,
  SourcePolicy,
  SourceRuntimeProfile,
} from '@/types/source'

type EditSourceViewProps = {
  open?: boolean
  source?: BookSource | null
}

type SourceDiagnosticSuggestion = {
  id: string
  title: string
  detail: string
}

const LICENSE_OPTIONS: Array<{
  value: SourceLicenseStatus
  label: string
}> = [
  { value: 'unknown', label: '待审核' },
  { value: 'licensed', label: '已授权' },
  { value: 'public_domain', label: '公版' },
  { value: 'restricted', label: '受限' },
  { value: 'blocked', label: '已封禁' },
]

const ACCESS_MODE_OPTIONS: Array<{
  value: SourceAccessMode
  label: string
}> = [
  { value: 'unknown', label: '未标注' },
  { value: 'api', label: '官方 API' },
  { value: 'feed', label: '内容 Feed' },
  { value: 'public_archive', label: '公版归档' },
  { value: 'manual_import', label: '人工导入' },
]

function toDateTimeLocal(value?: number): string {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
    return ''
  }

  const date = new Date(value * 1000)
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')

  return `${year}-${month}-${day}T${hours}:${minutes}`
}

function toUnixTimestamp(value: string): number | undefined {
  if (!value.trim()) {
    return undefined
  }

  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) {
    return undefined
  }

  return Math.floor(timestamp / 1000)
}

export function useEditSourceView(options: { props: EditSourceViewProps }) {
  const message = useMessage()
  const sourceStore = useSourceStore()

  const loading = ref(false)
  const saving = ref(false)
  const diagnosticsLoading = ref(false)
  const resettingRuntime = ref(false)
  const jsonText = ref('')
  const licenseStatus = ref<SourceLicenseStatus>('unknown')
  const accessMode = ref<SourceAccessMode>('unknown')
  const lastVerifiedAt = ref('')
  const notes = ref('')
  const runtimeProfile = ref<SourceRuntimeProfile | null>(null)
  const circuitState = ref('unknown')
  const runtimeError = ref('')

  const canEditPolicy = computed(() => Boolean(options.props.source?.id))
  const publicAccessEnabled = computed(() => options.props.source?.publicAccessEnabled === true)
  const diagnosticSuggestions = computed<SourceDiagnosticSuggestion[]>(() => {
    return buildSourceGovernanceSuggestions(options.props.source?.health, circuitState.value)
  })

  function hydratePolicyForm(source: BookSource) {
    licenseStatus.value = source.policy?.licenseStatus ?? 'unknown'
    accessMode.value = source.policy?.accessMode ?? 'unknown'
    lastVerifiedAt.value = toDateTimeLocal(source.policy?.lastVerifiedAt)
    notes.value = source.policy?.notes ?? ''
  }

  watch(
    () => options.props.source,
    source => {
      if (!source) {
        jsonText.value = ''
        runtimeProfile.value = null
        circuitState.value = 'unknown'
        runtimeError.value = ''
        hydratePolicyForm({
          id: '',
          name: '',
          enabled: true,
        })
        return
      }

      hydratePolicyForm(source)
    },
    { immediate: true }
  )

  watch(
    () => options.props.open,
    async open => {
      if (!open || !options.props.source) {
        return
      }

      loading.value = true
      diagnosticsLoading.value = true
      try {
        const [result, runtimeProfileResponse, circuitStateResponse] = await Promise.all([
          sourceStore.getSourceDetailText(options.props.source),
          sourceStore.getSourceRuntimeProfile(options.props.source.id),
          sourceStore.getSourceCircuitState(options.props.source.id),
        ])
        jsonText.value = result.text
        runtimeProfile.value = runtimeProfileResponse.isSuccess
          ? runtimeProfileResponse.data?.profile || null
          : null
        circuitState.value = circuitStateResponse.isSuccess
          ? circuitStateResponse.data?.state || 'unknown'
          : 'unknown'
        runtimeError.value =
          !runtimeProfileResponse.isSuccess || !circuitStateResponse.isSuccess
            ? '部分运行时诊断信息加载失败'
            : ''

        if (result.isStale && result.errorMsg) {
          message.warning(result.errorMsg)
        }
      } catch {
        message.warning('无法加载最新书源定义，已显示当前列表中的数据')
      } finally {
        loading.value = false
        diagnosticsLoading.value = false
      }
    }
  )

  async function savePolicy(): Promise<BookSource | null> {
    if (!options.props.source?.id) {
      message.warning('缺少书源标识，无法保存策略')
      return null
    }

    const payload: SourcePolicy = {
      licenseStatus: licenseStatus.value,
      accessMode: accessMode.value,
      lastVerifiedAt: toUnixTimestamp(lastVerifiedAt.value),
      notes: notes.value.trim() || undefined,
    }

    saving.value = true
    try {
      const response = await sourceStore.updateSourcePolicy(options.props.source.id, payload)

      if (!response.isSuccess || !response.data) {
        message.error(response.errorMsg || '保存治理策略失败')
        return null
      }

      hydratePolicyForm(response.data)
      jsonText.value = JSON.stringify(response.data, null, 2)
      message.success('治理策略已更新')
      return response.data
    } catch {
      message.error('保存治理策略失败')
      return null
    } finally {
      saving.value = false
    }
  }

  async function resetRuntimeState(mode: 'full' | 'circuit_only' = 'full'): Promise<boolean> {
    if (!options.props.source?.id) {
      message.warning('缺少书源标识，无法重置运行时状态')
      return false
    }

    resettingRuntime.value = true
    try {
      const response = await sourceStore.resetSourceRuntimeState(options.props.source.id, mode)
      if (!response.isSuccess) {
        message.error(response.errorMsg || '重置运行时状态失败')
        return false
      }

      circuitState.value = 'closed'
      if (mode === 'full') {
        runtimeProfile.value = null
        runtimeError.value = ''
      }
      await sourceStore.loadSources(true)
      message.success(
        mode === 'circuit_only' ? '已重置熔断状态' : '已重置书源健康分、熔断状态与提取指标'
      )
      return true
    } catch {
      message.error('重置运行时状态失败')
      return false
    } finally {
      resettingRuntime.value = false
    }
  }

  return {
    loading,
    saving,
    diagnosticsLoading,
    resettingRuntime,
    jsonText,
    canEditPolicy,
    publicAccessEnabled,
    runtimeProfile,
    circuitState,
    runtimeError,
    diagnosticSuggestions,
    licenseStatus,
    accessMode,
    lastVerifiedAt,
    notes,
    licenseOptions: LICENSE_OPTIONS,
    accessModeOptions: ACCESS_MODE_OPTIONS,
    savePolicy,
    resetRuntimeState,
  }
}
