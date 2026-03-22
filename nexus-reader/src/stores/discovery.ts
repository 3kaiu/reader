import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { discoveryApi } from '@/api/discovery'
import type { ApiResponse } from '@/api/http/types'
import type { DiscoveryItem, DiscoveryResponse } from '@/types/discovery'

type DiscoveryPeriodOption = {
  value: string
  label: string
  active: boolean
}

function formatDateRange(start?: string, end?: string): string {
  if (!start) return ''

  const startLabel = new Date(start).toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
  })
  const endLabel = new Date(end || start).toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
  })

  return `${startLabel} - ${endLabel}`
}

function formatPeriodLabel(period?: string): string {
  if (!period) return ''
  return period === 'all' ? '全部历史' : period
}

function formatPeriodButtonLabel(period?: string): string {
  if (!period) return ''
  return period === 'all' ? '全部' : period
}

export const useDiscoveryStore = defineStore('discovery', () => {
  const data = ref<DiscoveryResponse | null>(null)
  const loading = ref(false)
  const loaded = ref(false)

  const currentPeriod = computed(() => data.value?.period || '')
  const currentPeriodLabel = computed(() => formatPeriodLabel(currentPeriod.value))
  const currentPeriodButtonLabel = computed(() =>
    formatPeriodButtonLabel(currentPeriod.value)
  )
  const availablePeriods = computed(() => data.value?.availablePeriods || [])
  const periodOptions = computed<DiscoveryPeriodOption[]>(() =>
    availablePeriods.value.map(period => ({
      value: period,
      label: formatPeriodLabel(period),
      active: period === currentPeriod.value,
    }))
  )
  const sectionsByType = computed<Record<string, DiscoveryItem[]>>(() =>
    Object.fromEntries(
      (data.value?.sections || []).map(section => [section.section, section.items])
    )
  )
  const heroItems = computed(() => sectionsByType.value.carousel || [])
  const featuredItems = computed(() => sectionsByType.value.image_list || [])
  const rankedItems = computed(() => sectionsByType.value.new_sign || [])
  const dateRangeLabel = computed(() =>
    formatDateRange(data.value?.startDate, data.value?.endDate)
  )

  async function loadDiscovery(period?: string): Promise<ApiResponse<DiscoveryResponse>> {
    loading.value = true

    try {
      const response = await discoveryApi.getDiscovery(period)
      if (response.isSuccess && response.data) {
        data.value = response.data
        loaded.value = true
      }
      return response
    } finally {
      loading.value = false
    }
  }

  return {
    data,
    loading,
    loaded,
    currentPeriod,
    currentPeriodLabel,
    currentPeriodButtonLabel,
    availablePeriods,
    periodOptions,
    sectionsByType,
    heroItems,
    featuredItems,
    rankedItems,
    dateRangeLabel,
    loadDiscovery,
  }
})
