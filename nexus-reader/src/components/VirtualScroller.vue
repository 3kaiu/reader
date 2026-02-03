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
          :ref="(el) => setItemRef(el, item)"
          class="virtual-item"
          :style="getItemStyle(item)"
          :data-index="item.index"
        >
          <slot :item="item.data" :index="item.index" />
        </div>
      </div>

      <!-- 下方填充区域 -->
      <div
        class="virtual-spacer"
        :style="{ height: `${bottomSpacerHeight}px` }"
      ></div>
    </div>

    <!-- 滚动指示器 -->
    <div
      v-if="showScrollIndicator"
      class="scroll-indicator"
      :style="scrollIndicatorStyle"
    >
      <div class="scroll-thumb" :style="scrollThumbStyle"></div>
    </div>

    <!-- 性能监控信息 -->
    <div v-if="showPerformanceInfo && performanceInfo" class="performance-info">
      <div class="perf-item">FPS: {{ performanceInfo.fps }}</div>
      <div class="perf-item">渲染: {{ performanceInfo.renderTime }}ms</div>
      <div class="perf-item">
        可见: {{ visibleItems.length }}/{{ items.length }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from "vue";
import { perfMonitor } from "../services/performance/monitor";

// 防抖工具函数
const debounce = (fn: Function, delay: number) => {
  let timeoutId: number | null = null;
  return (...args: any[]) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(null, args), delay);
  };
};

// 节流工具函数
const throttle = (fn: Function, limit: number) => {
  let inThrottle = false;
  return (...args: any[]) => {
    if (!inThrottle) {
      fn.apply(null, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

interface VirtualScrollerItem {
  index: number;
  data: any;
  height?: number;
  offset?: number;
}

interface PerformanceInfo {
  fps: number;
  renderTime: number;
  scrollTop: number;
  visibleCount: number;
}

interface Props {
  items: any[];
  itemHeight?: number | ((item: any, index: number) => number);
  containerHeight?: number;
  overscan?: number;
  horizontal?: boolean;
  showScrollIndicator?: boolean;
  showPerformanceInfo?: boolean;
  keyField?: string;
  estimatedItemHeight?: number;
  bufferSize?: number;
  throttleMs?: number;
}

const props = withDefaults(defineProps<Props>(), {
  itemHeight: 50,
  containerHeight: 400,
  overscan: 5,
  horizontal: false,
  showScrollIndicator: true,
  showPerformanceInfo: false,
  keyField: "id",
  estimatedItemHeight: 50,
  bufferSize: 10,
  throttleMs: 16,
});

const emit = defineEmits<{
  scroll: [{ scrollTop: number; scrollLeft: number }];
  visibleRangeChange: [{ start: number; end: number }];
  itemResize: [{ index: number; height: number }];
}>();

// 响应式状态
const containerRef = ref<HTMLElement>();
const scrollTop = ref(0);
const scrollLeft = ref(0);
const containerSize = ref({ width: 0, height: 0 });
const itemHeights = ref<Map<number, number>>(new Map());
const itemOffsets = ref<Map<number, number>>(new Map());
const visibleRange = ref({ start: 0, end: 0 });
const performanceInfo = ref<PerformanceInfo | null>(null);
const itemRefs = ref<Map<number, HTMLElement>>(new Map());

// 性能监控
let frameCount = 0;
let lastFrameTime = 0;
let renderStartTime = 0;

// 计算属性
const containerStyle = computed(() => ({
  height: `${props.containerHeight}px`,
  overflow: "auto",
  position: "relative",
}));

const totalHeight = computed(() => {
  if (typeof props.itemHeight === "number") {
    return props.items.length * props.itemHeight;
  }

  // 动态高度计算
  let total = 0;
  for (let i = 0; i < props.items.length; i++) {
    total += getItemHeight(i);
  }
  return total;
});

const contentStyle = computed(() => ({
  height: `${totalHeight.value}px`,
  position: "relative",
}));

const visibleItems = computed(() => {
  const items: VirtualScrollerItem[] = [];
  const start = Math.max(0, visibleRange.value.start - props.overscan);
  const end = Math.min(
    props.items.length - 1,
    visibleRange.value.end + props.overscan
  );

  for (let i = start; i <= end; i++) {
    items.push({
      index: i,
      data: props.items[i],
      height: getItemHeight(i),
      offset: getItemOffset(i),
    });
  }

  return items;
});

const offsetY = computed(() => {
  const start = Math.max(0, visibleRange.value.start - props.overscan);
  return getItemOffset(start);
});

const bottomSpacerHeight = computed(() => {
  const end = Math.min(
    props.items.length - 1,
    visibleRange.value.end + props.overscan
  );
  const endOffset = getItemOffset(end) + getItemHeight(end);
  return Math.max(0, totalHeight.value - endOffset);
});

const scrollIndicatorStyle = computed(() => ({
  position: "absolute",
  right: "2px",
  top: "2px",
  bottom: "2px",
  width: "6px",
  background: "rgba(0, 0, 0, 0.1)",
  borderRadius: "3px",
  pointerEvents: "none",
}));

const scrollThumbStyle = computed(() => {
  const thumbHeight = Math.max(
    20,
    (containerSize.value.height / totalHeight.value) *
      containerSize.value.height
  );
  const thumbTop =
    (scrollTop.value / totalHeight.value) * containerSize.value.height;

  return {
    position: "absolute",
    top: `${thumbTop}px`,
    width: "100%",
    height: `${thumbHeight}px`,
    background: "rgba(0, 0, 0, 0.3)",
    borderRadius: "3px",
    transition: "opacity 0.2s ease",
  };
});

// 方法
const getItemHeight = (index: number): number => {
  if (typeof props.itemHeight === "number") {
    return props.itemHeight;
  }

  // 检查缓存的高度
  if (itemHeights.value.has(index)) {
    return itemHeights.value.get(index)!;
  }

  // 使用函数计算高度
  if (typeof props.itemHeight === "function") {
    const height = props.itemHeight(props.items[index], index);
    itemHeights.value.set(index, height);
    return height;
  }

  return props.estimatedItemHeight;
};

const getItemOffset = (index: number): number => {
  if (itemOffsets.value.has(index)) {
    return itemOffsets.value.get(index)!;
  }

  let offset = 0;
  for (let i = 0; i < index; i++) {
    offset += getItemHeight(i);
  }

  itemOffsets.value.set(index, offset);
  return offset;
};

const getItemKey = (item: VirtualScrollerItem): string | number => {
  if (props.keyField && item.data[props.keyField]) {
    return item.data[props.keyField];
  }
  return item.index;
};

const getItemStyle = (item: VirtualScrollerItem) => ({
  position: "absolute" as const,
  top: `${item.offset || 0}px`,
  left: "0",
  right: "0",
  height: `${item.height}px`,
});

const setItemRef = (el: Element | null, item: VirtualScrollerItem) => {
  if (el) {
    itemRefs.value.set(item.index, el as HTMLElement);
  } else {
    itemRefs.value.delete(item.index);
  }
};

const updateVisibleRange = () => {
  renderStartTime = performance.now();

  const containerHeight = containerSize.value.height;
  const scrollPosition = scrollTop.value;

  // 二分查找起始位置
  let start = 0;
  let end = props.items.length - 1;

  while (start < end) {
    const mid = Math.floor((start + end) / 2);
    const midOffset = getItemOffset(mid);

    if (midOffset < scrollPosition) {
      start = mid + 1;
    } else {
      end = mid;
    }
  }

  // 确保起始位置在视口内
  while (start > 0 && getItemOffset(start) > scrollPosition) {
    start--;
  }

  // 计算结束位置
  let visibleEnd = start;
  let currentOffset = getItemOffset(start);

  while (
    visibleEnd < props.items.length &&
    currentOffset < scrollPosition + containerHeight
  ) {
    currentOffset += getItemHeight(visibleEnd);
    visibleEnd++;
  }

  const newRange = { start, end: visibleEnd - 1 };

  // 只有范围真正改变时才更新
  if (
    newRange.start !== visibleRange.value.start ||
    newRange.end !== visibleRange.value.end
  ) {
    visibleRange.value = newRange;
    emit("visibleRangeChange", newRange);
  }

  // 更新性能信息
  if (props.showPerformanceInfo) {
    updatePerformanceInfo();
  }
};

const handleScroll = (event: Event) => {
  const target = event.target as HTMLElement;
  scrollTop.value = target.scrollTop;
  scrollLeft.value = target.scrollLeft;

  emit("scroll", { scrollTop: scrollTop.value, scrollLeft: scrollLeft.value });

  // 节流更新可见范围
  throttledUpdateVisibleRange();
};

// 优化的节流更新函数
const throttledUpdateVisibleRange = throttle(() => {
  updateVisibleRange();
}, Math.max(props.throttleMs, 8)); // 最少8ms节流

const updateContainerSize = () => {
  if (containerRef.value) {
    const rect = containerRef.value.getBoundingClientRect();
    containerSize.value = {
      width: rect.width,
      height: rect.height,
    };
  }
};

const updatePerformanceInfo = () => {
  const now = performance.now();
  const renderTime = now - renderStartTime;

  // 计算FPS
  frameCount++;
  if (now - lastFrameTime >= 1000) {
    const fps = Math.round((frameCount * 1000) / (now - lastFrameTime));
    frameCount = 0;
    lastFrameTime = now;

    performanceInfo.value = {
      fps,
      renderTime: Math.round(renderTime * 100) / 100,
      scrollTop: scrollTop.value,
      visibleCount: visibleItems.value.length,
    };

    // 报告性能指标
    if (window.performanceMonitor) {
      window.performanceMonitor.reportMetric("virtual_scroll_fps", fps, {
        renderTime,
        visibleCount: visibleItems.value.length,
        totalItems: props.items.length,
      });
    }
  }
};

// 优化的项目高度测量
let resizeObserver: ResizeObserver | null = null;
const observedElements = new Set<Element>();

const measureItemHeights = async () => {
  await nextTick();

  // 清理旧的观察者
  if (resizeObserver) {
    resizeObserver.disconnect();
    observedElements.clear();
  }

  // 创建新的ResizeObserver
  resizeObserver = new ResizeObserver(
    debounce((entries) => {
      let hasChanges = false;

      for (const entry of entries) {
        const element = entry.target as HTMLElement;
        const index = parseInt(element.dataset.index || "0");
        const newHeight = entry.contentRect.height;
        const oldHeight = itemHeights.value.get(index);

        if (oldHeight !== newHeight) {
          itemHeights.value.set(index, newHeight);
          hasChanges = true;
          emit("itemResize", { index, height: newHeight });
        }
      }

      if (hasChanges) {
        itemOffsets.value.clear();
        updateVisibleRange();
      }
    }, 16)
  ); // 60fps防抖

  // 观察可见项目
  for (const [index, element] of itemRefs.value.entries()) {
    if (element && !observedElements.has(element)) {
      element.dataset.index = index.toString();
      resizeObserver.observe(element);
      observedElements.add(element);
    }
  }
};

const scrollToIndex = (index: number, behavior: ScrollBehavior = "smooth") => {
  if (!containerRef.value) return;

  const offset = getItemOffset(index);
  containerRef.value.scrollTo({
    top: offset,
    behavior,
  });
};

const scrollToTop = (behavior: ScrollBehavior = "smooth") => {
  scrollToIndex(0, behavior);
};

const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
  if (!containerRef.value) return;

  containerRef.value.scrollTo({
    top: totalHeight.value,
    behavior,
  });
};

// 内存清理定时器
let memoryCleanupTimer: number | null = null;

// 生命周期
onMounted(async () => {
  updateContainerSize();
  updateVisibleRange();
  await measureItemHeights();

  // 监听窗口大小变化 (防抖)
  window.addEventListener("resize", debounce(updateContainerSize, 100));

  // 初始化性能监控
  lastFrameTime = performance.now();

  // 启动内存清理定时器 (每5分钟清理一次)
  memoryCleanupTimer = window.setInterval(() => {
    performMemoryCleanup();
  }, 5 * 60 * 1000);

  console.log("🚀 Virtual scroller initialized with optimizations");
});

onUnmounted(() => {
  window.removeEventListener("resize", updateContainerSize);

  // 清理所有定时器和观察者
  if (updateTimer) {
    clearTimeout(updateTimer);
  }
  if (memoryCleanupTimer) {
    clearInterval(memoryCleanupTimer);
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }

  // 清理引用防止内存泄漏
  observedElements.clear();
  itemRefs.value.clear();
  itemHeights.value.clear();
  itemOffsets.value.clear();
});

// 监听数据变化
watch(
  () => props.items,
  () => {
    // 清除缓存
    itemHeights.value.clear();
    itemOffsets.value.clear();

    // 重新计算可见范围
    nextTick(() => {
      updateVisibleRange();
      measureItemHeights();
    });
  },
  { deep: true }
);

// 监听容器高度变化
watch(
  () => props.containerHeight,
  () => {
    updateContainerSize();
    updateVisibleRange();
  }
);

// 定期测量项目高度
let measureTimer: number | null = null;
watch(visibleItems, () => {
  if (measureTimer) clearTimeout(measureTimer);

  measureTimer = window.setTimeout(() => {
    measureItemHeights();
  }, 100);
});

// 暴露方法给父组件
defineExpose({
  scrollToIndex,
  scrollToTop,
  scrollToBottom,
  getVisibleRange: () => visibleRange.value,
  getPerformanceInfo: () => performanceInfo.value,
});
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

// 内存清理函数
const performMemoryCleanup = () => {
  // 强制垃圾回收 (如果可用)
  if (window.gc) {
    window.gc()
  }

  // 清理超出视窗范围的DOM引用
  const visibleIndices = new Set(visibleItems.value.map(item => item.index))
  const toRemove: number[] = []

  for (const [index] of itemHeights.value.entries()) {
    if (!visibleIndices.has(index) && Math.abs(index - scrollTop.value / averageItemHeight.value) > 50) {
      toRemove.push(index)
    }
  }

  // 清理远距离的项目高度缓存
  for (const index of toRemove) {
    itemHeights.value.delete(index)
    itemOffsets.value.delete(index)
  }

  if (toRemove.length > 0) {
    console.log(`🧹 Cleaned up ${toRemove.length} distant virtual items`)
  }
}
</style>
