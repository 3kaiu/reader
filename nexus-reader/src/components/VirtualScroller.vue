<template>
  <div 
    ref="containerRef" 
    class="virtual-scroller" 
    :style="containerStyle"
    @scroll="handleScroll"
  >
    <!-- 虚拟滚动容器 -->
    <div class="virtual-scroller-content" :style="contentStyle">
      <!-- 上方填充区域 -->
      <div class="virtual-spacer" :style="{ height: `${offsetY}px` }"></div>
      
      <!-- 可见项目渲染区域 -->
      <div class="virtual-items">
        <div
          v-for="item in visibleItems"
          :key="getItemKey(item)"
          :ref="el => setItemRef(el, item)"
          class="virtual-item"
          :style="getItemStyle(item)"
          :data-index="item.index"
        >
          <slot :item="item.data" :index="item.index" />
        </div>
      </div>
      
      <!-- 下方填充区域 -->
      <div class="virtual-spacer" :style="{ height: `${bottomSpacerHeight}px` }"></div>
    </div>

    <!-- 滚动指示器 -->
    <div v-if="showScrollIndicator" class="scroll-indicator" :style="scrollIndicatorStyle">
      <div class="scroll-thumb" :style="scrollThumbStyle"></div>
    </div>

    <!-- 性能监控信息 -->
    <div v-if="showPerformanceInfo && performanceInfo" class="performance-info">
      <div class="perf-item">FPS: {{ performanceInfo.fps }}</div>
      <div class="perf-item">渲染: {{ performanceInfo.renderTime }}ms</div>
      <div class="perf-item">可见: {{ visibleItems.length }}/{{ items.length }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { performanceMonitor } from '../utils/performanceMonitor'

interface VirtualScrollerItem {
  index: number
  data: any
  height?: number
  offset?: number
}

interface PerformanceInfo {
  fps: number
  renderTime: number
  scrollTop: number
  visibleCount: number
}

interface Props {
  items: any[]
  itemHeight?: number | ((item: any, index: number) => number)
  containerHeight?: number
  overscan?: number
  horizontal?: boolean
  showScrollIndicator?: boolean
  showPerformanceInfo?: boolean
  keyField?: string
  estimatedItemHeight?: number
  bufferSize?: number
  throttleMs?: number
}

const props = withDefaults(defineProps<Props>(), {
  itemHeight: 50,
  containerHeight: 400,
  overscan: 5,
  horizontal: false,
  showScrollIndicator: true,
  showPerformanceInfo: false,
  keyField: 'id',
  estimatedItemHeight: 50,
  bufferSize: 10,
  throttleMs: 16
})

const emit = defineEmits<{
  scroll: [{ scrollTop: number; scrollLeft: number }]
  visibleRangeChange: [{ start: number; end: number }]
  itemResize: [{ index: number; height: number }]
}>()

// 响应式状态
const containerRef = ref<HTMLElement>()
const scrollTop = ref(0)
const scrollLeft = ref(0)
const containerSize = ref({ width: 0, height: 0 })
const itemHeights = ref<Map<number, number>>(new Map())
const itemOffsets = ref<Map<number, number>>(new Map())
const visibleRange = ref({ start: 0, end: 0 })
const performanceInfo = ref<PerformanceInfo | null>(null)
const itemRefs = ref<Map<number, HTMLElement>>(new Map())

// 性能监控
let frameCount = 0
let lastFrameTime = 0
let renderStartTime = 0

// 计算属性
const containerStyle = computed(() => ({
  height: `${props.containerHeight}px`,
  overflow: 'auto',
  position: 'relative'
}))

const totalHeight = computed(() => {
  if (typeof props.itemHeight === 'number') {
    return props.items.length * props.itemHeight
  }
  
  // 动态高度计算
  let total = 0
  for (let i = 0; i < props.items.length; i++) {
    total += getItemHeight(i)
  }
  return total
})

const contentStyle = computed(() => ({
  height: `${totalHeight.value}px`,
  position: 'relative'
}))

const visibleItems = computed(() => {
  const items: VirtualScrollerItem[] = []
  const start = Math.max(0, visibleRange.value.start - props.overscan)
  const end = Math.min(props.items.length - 1, visibleRange.value.end + props.overscan)

  for (let i = start; i <= end; i++) {
    items.push({
      index: i,
      data: props.items[i],
      height: getItemHeight(i),
      offset: getItemOffset(i)
    })
  }

  return items
})

const offsetY = computed(() => {
  const start = Math.max(0, visibleRange.value.start - props.overscan)
  return getItemOffset(start)
})

const bottomSpacerHeight = computed(() => {
  const end = Math.min(props.items.length - 1, visibleRange.value.end + props.overscan)
  const endOffset = getItemOffset(end) + getItemHeight(end)
  return Math.max(0, totalHeight.value - endOffset)
})

const scrollIndicatorStyle = computed(() => ({
  position: 'absolute',
  right: '2px',
  top: '2px',
  bottom: '2px',
  width: '6px',
  background: 'rgba(0, 0, 0, 0.1)',
  borderRadius: '3px',
  pointerEvents: 'none'
}))

const scrollThumbStyle = computed(() => {
  const thumbHeight = Math.max(20, (containerSize.value.height / totalHeight.value) * containerSize.value.height)
  const thumbTop = (scrollTop.value / totalHeight.value) * containerSize.value.height
  
  return {
    position: 'absolute',
    top: `${thumbTop}px`,
    width: '100%',
    height: `${thumbHeight}px`,
    background: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '3px',
    transition: 'opacity 0.2s ease'
  }
})

// 方法
const getItemHeight = (index: number): number => {
  if (typeof props.itemHeight === 'number') {
    return props.itemHeight
  }
  
  // 检查缓存的高度
  if (itemHeights.value.has(index)) {
    return itemHeights.value.get(index)!
  }
  
  // 使用函数计算高度
  if (typeof props.itemHeight === 'function') {
    const height = props.itemHeight(props.items[index], index)
    itemHeights.value.set(index, height)
    return height
  }
  
  return props.estimatedItemHeight
}

const getItemOffset = (index: number): number => {
  if (itemOffsets.value.has(index)) {
    return itemOffsets.value.get(index)!
  }
  
  let offset = 0
  for (let i = 0; i < index; i++) {
    offset += getItemHeight(i)
  }
  
  itemOffsets.value.set(index, offset)
  return offset
}

const getItemKey = (item: VirtualScrollerItem): string | number => {
  if (props.keyField && item.data[props.keyField]) {
    return item.data[props.keyField]
  }
  return item.index
}

const getItemStyle = (item: VirtualScrollerItem) => ({
  position: 'absolute' as const,
  top: `${item.offset || 0}px`,
  left: '0',
  right: '0',
  height: `${item.height}px`
})

const setItemRef = (el: Element | null, item: VirtualScrollerItem) => {
  if (el) {
    itemRefs.value.set(item.index, el as HTMLElement)
  } else {
    itemRefs.value.delete(item.index)
  }
}

const updateVisibleRange = () => {
  renderStartTime = performance.now()
  
  const containerHeight = containerSize.value.height
  const scrollPosition = scrollTop.value
  
  // 二分查找起始位置
  let start = 0
  let end = props.items.length - 1
  
  while (start < end) {
    const mid = Math.floor((start + end) / 2)
    const midOffset = getItemOffset(mid)
    
    if (midOffset < scrollPosition) {
      start = mid + 1
    } else {
      end = mid
    }
  }
  
  // 确保起始位置在视口内
  while (start > 0 && getItemOffset(start) > scrollPosition) {
    start--
  }
  
  // 计算结束位置
  let visibleEnd = start
  let currentOffset = getItemOffset(start)
  
  while (visibleEnd < props.items.length && currentOffset < scrollPosition + containerHeight) {
    currentOffset += getItemHeight(visibleEnd)
    visibleEnd++
  }
  
  const newRange = { start, end: visibleEnd - 1 }
  
  // 只有范围真正改变时才更新
  if (newRange.start !== visibleRange.value.start || newRange.end !== visibleRange.value.end) {
    visibleRange.value = newRange
    emit('visibleRangeChange', newRange)
  }
  
  // 更新性能信息
  if (props.showPerformanceInfo) {
    updatePerformanceInfo()
  }
}

const handleScroll = (event: Event) => {
  const target = event.target as HTMLElement
  scrollTop.value = target.scrollTop
  scrollLeft.value = target.scrollLeft
  
  emit('scroll', { scrollTop: scrollTop.value, scrollLeft: scrollLeft.value })
  
  // 节流更新可见范围
  throttledUpdateVisibleRange()
}

// 节流函数
let updateTimer: number | null = null
const throttledUpdateVisibleRange = () => {
  if (updateTimer) return
  
  updateTimer = window.setTimeout(() => {
    updateVisibleRange()
    updateTimer = null
  }, props.throttleMs)
}

const updateContainerSize = () => {
  if (containerRef.value) {
    const rect = containerRef.value.getBoundingClientRect()
    containerSize.value = {
      width: rect.width,
      height: rect.height
    }
  }
}

const updatePerformanceInfo = () => {
  const now = performance.now()
  const renderTime = now - renderStartTime
  
  // 计算FPS
  frameCount++
  if (now - lastFrameTime >= 1000) {
    const fps = Math.round((frameCount * 1000) / (now - lastFrameTime))
    frameCount = 0
    lastFrameTime = now
    
    performanceInfo.value = {
      fps,
      renderTime: Math.round(renderTime * 100) / 100,
      scrollTop: scrollTop.value,
      visibleCount: visibleItems.value.length
    }
    
    // 报告性能指标
    if (window.performanceMonitor) {
      window.performanceMonitor.reportMetric('virtual_scroll_fps', fps, {
        renderTime,
        visibleCount: visibleItems.value.length,
        totalItems: props.items.length
      })
    }
  }
}

const measureItemHeights = async () => {
  await nextTick()
  
  let hasChanges = false
  
  for (const [index, element] of itemRefs.value.entries()) {
    const rect = element.getBoundingClientRect()
    const newHeight = rect.height
    const oldHeight = itemHeights.value.get(index)
    
    if (oldHeight !== newHeight) {
      itemHeights.value.set(index, newHeight)
      hasChanges = true
      
      emit('itemResize', { index, height: newHeight })
    }
  }
  
  if (hasChanges) {
    // 重新计算偏移量
    itemOffsets.value.clear()
    updateVisibleRange()
  }
}

const scrollToIndex = (index: number, behavior: ScrollBehavior = 'smooth') => {
  if (!containerRef.value) return
  
  const offset = getItemOffset(index)
  containerRef.value.scrollTo({
    top: offset,
    behavior
  })
}

const scrollToTop = (behavior: ScrollBehavior = 'smooth') => {
  scrollToIndex(0, behavior)
}

const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
  if (!containerRef.value) return
  
  containerRef.value.scrollTo({
    top: totalHeight.value,
    behavior
  })
}

// 生命周期
onMounted(() => {
  updateContainerSize()
  updateVisibleRange()
  
  // 监听窗口大小变化
  window.addEventListener('resize', updateContainerSize)
  
  // 初始化性能监控
  lastFrameTime = performance.now()
  
  console.log('🚀 Virtual scroller initialized')
})

onUnmounted(() => {
  window.removeEventListener('resize', updateContainerSize)
  
  if (updateTimer) {
    clearTimeout(updateTimer)
  }
})

// 监听数据变化
watch(() => props.items, () => {
  // 清除缓存
  itemHeights.value.clear()
  itemOffsets.value.clear()
  
  // 重新计算可见范围
  nextTick(() => {
    updateVisibleRange()
    measureItemHeights()
  })
}, { deep: true })

// 监听容器高度变化
watch(() => props.containerHeight, () => {
  updateContainerSize()
  updateVisibleRange()
})

// 定期测量项目高度
let measureTimer: number | null = null
watch(visibleItems, () => {
  if (measureTimer) clearTimeout(measureTimer)
  
  measureTimer = window.setTimeout(() => {
    measureItemHeights()
  }, 100)
})

// 暴露方法给父组件
defineExpose({
  scrollToIndex,
  scrollToTop,
  scrollToBottom,
  getVisibleRange: () => visibleRange.value,
  getPerformanceInfo: () => performanceInfo.value
})
</script>

<style scoped>
.virtual-scroller {
  position: relative;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
}

.virtual-scroller-content {
  position: relative;
}

.virtual-items {
  position: relative;
}

.virtual-item {
  position: absolute;
  left: 0;
  right: 0;
}

.virtual-spacer {
  flex-shrink: 0;
}

.scroll-indicator {
  position: absolute;
  right: 2px;
  top: 2px;
  bottom: 2px;
  width: 6px;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 3px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.virtual-scroller:hover .scroll-indicator {
  opacity: 1;
}

.scroll-thumb {
  position: absolute;
  width: 100%;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 3px;
  transition: background 0.2s ease;
}

.performance-info {
  position: absolute;
  top: 10px;
  left: 10px;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 8px;
  border-radius: 4px;
  font-size: 11px;
  font-family: monospace;
  pointer-events: none;
  z-index: 1000;
}

.perf-item {
  margin-bottom: 2px;
}

.perf-item:last-child {
  margin-bottom: 0;
}

/* 滚动条样式 */
.virtual-scroller::-webkit-scrollbar {
  width: 8px;
}

.virtual-scroller::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 4px;
}

.virtual-scroller::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  transition: background 0.2s ease;
}

.virtual-scroller::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.5);
}

/* 响应式 */
@media (max-width: 768px) {
  .performance-info {
    font-size: 10px;
    padding: 6px;
  }
  
  .scroll-indicator {
    width: 4px;
  }
}

/* 暗色主题 */
@media (prefers-color-scheme: dark) {
  .scroll-indicator {
    background: rgba(255, 255, 255, 0.1);
  }
  
  .scroll-thumb {
    background: rgba(255, 255, 255, 0.3);
  }
  
  .virtual-scroller::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
  }
  
  .virtual-scroller::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
  }
  
  .virtual-scroller::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.5);
  }
}
</style>