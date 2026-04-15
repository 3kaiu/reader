import { computed, ref, watch, type Ref } from 'vue'
import { useWindowSize } from '@vueuse/core'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { VIRTUAL_SCROLL_OVERSCAN, VIRTUAL_SCROLL_THRESHOLD } from '@/constants/ui'
import { getBookshelfColumnsPerRow } from '@/utils/bookshelf'

export function useBookshelfVirtualGrid<T>(items: Ref<readonly T[]>) {
  const { width: windowWidth } = useWindowSize()
  const virtualContainerRef = ref<HTMLElement | null>(null)

  const columnsPerRow = computed(() => getBookshelfColumnsPerRow(windowWidth.value || 1280))
  const rows = computed(() => Math.ceil(items.value.length / Math.max(columnsPerRow.value, 1)))
  const shouldUseVirtualScroll = computed(() => items.value.length > VIRTUAL_SCROLL_THRESHOLD)

  const virtualizer = useVirtualizer({
    count: rows.value,
    getScrollElement: () => virtualContainerRef.value,
    estimateSize: () => {
      const columns = columnsPerRow.value
      return columns <= 3 ? 280 : columns <= 4 ? 260 : 240
    },
    overscan: VIRTUAL_SCROLL_OVERSCAN,
  })

  function getVirtualRowItems(rowIndex: number): T[] {
    const start = rowIndex * columnsPerRow.value
    return items.value.slice(start, start + columnsPerRow.value)
  }

  watch(
    rows,
    count => {
      if (!virtualizer.value) {
        return
      }

      virtualizer.value.setOptions({
        ...virtualizer.value.options,
        count,
      })
      virtualizer.value.measure()
    },
    { flush: 'post' }
  )

  watch(
    windowWidth,
    () => {
      if (virtualizer.value) {
        virtualizer.value.measure()
      }
    },
    { flush: 'post' }
  )

  return {
    virtualContainerRef,
    columnsPerRow,
    shouldUseVirtualScroll,
    virtualizer,
    getVirtualRowItems,
  }
}
