import { computed, ref, watch } from 'vue'
import { useMessage } from '@/composables/useMessage'
import { useSourceStore } from '@/stores/source'
import type {
  BookSource,
  SourceAccessMode,
  SourceLicenseStatus,
  SourcePolicy,
} from '@/types/source'

type EditSourceViewProps = {
  open?: boolean
  source?: BookSource | null
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
  const jsonText = ref('')
  const licenseStatus = ref<SourceLicenseStatus>('unknown')
  const accessMode = ref<SourceAccessMode>('unknown')
  const lastVerifiedAt = ref('')
  const notes = ref('')

  const canEditPolicy = computed(() => Boolean(options.props.source?.id))
  const publicAccessEnabled = computed(
    () => options.props.source?.publicAccessEnabled === true,
  )

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
        hydratePolicyForm({
          id: '',
          name: '',
          enabled: true,
        })
        return
      }

      hydratePolicyForm(source)
    },
    { immediate: true },
  )

  watch(
    () => options.props.open,
    async open => {
      if (!open || !options.props.source) {
        return
      }

      loading.value = true
      try {
        const result = await sourceStore.getSourceDetailText(options.props.source)
        jsonText.value = result.text

        if (result.isStale && result.errorMsg) {
          message.warning(result.errorMsg)
        }
      } catch {
        message.warning('无法加载最新书源定义，已显示当前列表中的数据')
      } finally {
        loading.value = false
      }
    },
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

  return {
    loading,
    saving,
    jsonText,
    canEditPolicy,
    publicAccessEnabled,
    licenseStatus,
    accessMode,
    lastVerifiedAt,
    notes,
    licenseOptions: LICENSE_OPTIONS,
    accessModeOptions: ACCESS_MODE_OPTIONS,
    savePolicy,
  }
}
