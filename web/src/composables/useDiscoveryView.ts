import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useErrorHandler } from '@/composables/useErrorHandler'
import { useDiscoveryStore } from '@/stores/discovery'
import type { DiscoveryItem } from '@/types/discovery'

export function useDiscoveryView() {
  const router = useRouter()
  const discoveryStore = useDiscoveryStore()
  const { handlePromiseError } = useErrorHandler()
  const {
    data,
    loading,
    currentPeriodLabel,
    currentPeriodButtonLabel,
    periodOptions,
    heroItems,
    featuredItems,
    rankedItems,
    dateRangeLabel,
  } = storeToRefs(discoveryStore)

  async function loadDiscovery(period?: string) {
    try {
      await discoveryStore.loadDiscovery(period)
    } catch (error) {
      handlePromiseError(error, '加载发现数据失败')
    }
  }

  function changePeriod(period: string) {
    if (period === discoveryStore.currentPeriod) {
      return
    }

    void loadDiscovery(period)
  }

  function openDiscoveryItem(item: DiscoveryItem) {
    if (item.bookUrl) {
      window.open(item.bookUrl, '_blank', 'noopener,noreferrer')
      return
    }

    void router.push({
      path: '/search',
      query: { q: item.name },
    })
  }

  function goBack() {
    router.back()
  }

  onMounted(() => {
    void loadDiscovery()
  })

  return {
    data,
    loading,
    currentPeriodLabel,
    currentPeriodButtonLabel,
    periodOptions,
    heroItems,
    featuredItems,
    rankedItems,
    dateRangeLabel,
    loadDiscovery,
    changePeriod,
    openDiscoveryItem,
    goBack,
  }
}
