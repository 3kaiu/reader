import { ref, computed, onMounted, onUnmounted, watch, type Ref } from 'vue'

export interface VirtualScrollOptions {
    // 每个段落的估算高度
    estimatedItemHeight?: number
    // 可视区域上下额外渲染的缓冲区大小（像素）
    overscan?: number
    // 内容容器的 ref
    containerRef?: Ref<HTMLElement | null>
}

export interface VirtualItem {
    index: number
    start: number
    size: number
}

export function useVirtualScroll(
    items: Ref<any[]>,
    options: VirtualScrollOptions = {}
) {
    const {
        estimatedItemHeight = 40,
        overscan = 200,
        containerRef
    } = options

    // 状态
    const scrollTop = ref(0)
    const containerHeight = ref(window.innerHeight)
    const itemHeights = ref<Map<number, number>>(new Map())

    // 计算总高度
    const totalHeight = computed(() => {
        let height = 0
        for (let i = 0; i < items.value.length; i++) {
            height += itemHeights.value.get(i) || estimatedItemHeight
        }
        return height
    })

    // 计算可见范围
    const visibleRange = computed(() => {
        const start = scrollTop.value - overscan
        const end = scrollTop.value + containerHeight.value + overscan

        let startIndex = 0
        let endIndex = items.value.length - 1
        let accumulatedHeight = 0

        // 找到起始索引
        for (let i = 0; i < items.value.length; i++) {
            const itemHeight = itemHeights.value.get(i) || estimatedItemHeight
            if (accumulatedHeight + itemHeight > start) {
                startIndex = i
                break
            }
            accumulatedHeight += itemHeight
        }

        // 找到结束索引
        for (let i = startIndex; i < items.value.length; i++) {
            const itemHeight = itemHeights.value.get(i) || estimatedItemHeight
            accumulatedHeight += itemHeight
            if (accumulatedHeight > end) {
                endIndex = i
                break
            }
        }

        return { startIndex, endIndex }
    })

    // 计算可见项目
    const visibleItems = computed<VirtualItem[]>(() => {
        const { startIndex, endIndex } = visibleRange.value
        const result: VirtualItem[] = []

        let start = 0
        for (let i = 0; i < startIndex; i++) {
            start += itemHeights.value.get(i) || estimatedItemHeight
        }

        for (let i = startIndex; i <= endIndex && i < items.value.length; i++) {
            const size = itemHeights.value.get(i) || estimatedItemHeight
            result.push({ index: i, start, size })
            start += size
        }

        return result
    })

    // 计算偏移量（用于定位内容）
    const offsetY = computed(() => {
        if (visibleItems.value.length === 0) return 0
        return visibleItems.value[0].start
    })

    // 更新项目高度（在渲染后调用）
    function measureItem(index: number, height: number) {
        if (itemHeights.value.get(index) !== height) {
            itemHeights.value.set(index, height)
        }
    }

    // 滚动处理
    function handleScroll() {
        if (containerRef?.value) {
            scrollTop.value = containerRef.value.scrollTop
        } else {
            scrollTop.value = window.scrollY
        }
    }

    // 窗口大小变化处理
    function handleResize() {
        if (containerRef?.value) {
            containerHeight.value = containerRef.value.clientHeight
        } else {
            containerHeight.value = window.innerHeight
        }
    }

    // 生命周期
    onMounted(() => {
        const target = containerRef?.value || window
        target.addEventListener('scroll', handleScroll, { passive: true })
        window.addEventListener('resize', handleResize, { passive: true })
        handleResize()
        handleScroll()
    })

    onUnmounted(() => {
        const target = containerRef?.value || window
        target.removeEventListener('scroll', handleScroll)
        window.removeEventListener('resize', handleResize)
    })

    // 监听容器变化
    if (containerRef) {
        watch(containerRef, (newContainer, oldContainer) => {
            if (oldContainer) {
                oldContainer.removeEventListener('scroll', handleScroll)
            }
            if (newContainer) {
                newContainer.addEventListener('scroll', handleScroll, { passive: true })
                handleResize()
            }
        })
    }

    return {
        visibleItems,
        totalHeight,
        offsetY,
        measureItem,
        scrollTop,
        containerHeight
    }
}
