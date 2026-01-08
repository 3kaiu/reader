<script setup lang="ts">
/**
 * Skeleton - 骨架屏基础组件
 * 提供优雅的加载占位效果
 */
import { computed } from 'vue'
interface Props {
  variant?: 'text' | 'rect' | 'circle'
  width?: string | number
  height?: string | number
  className?: string
  animated?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'rect',
  animated: true,
  className: '',
})

const styles = computed(() => ({
  width: typeof props.width === 'number' ? `${props.width}px` : props.width,
  height: typeof props.height === 'number' ? `${props.height}px` : props.height,
}))
</script>

<template>
  <div
    class="skeleton-root bg-muted/60 relative overflow-hidden"
    :class="[
      variant === 'circle' ? 'rounded-full' : 'rounded-lg',
      animated ? 'skeleton-animated' : '',
      className
    ]"
    :style="styles"
  >
    <!-- 光效扫过 -->
    <div v-if="animated" class="skeleton-shimmer" />
  </div>
</template>

<style scoped>
.skeleton-root {
  display: inline-block;
  vertical-align: middle;
}

.skeleton-animated {
  background: linear-gradient(
    90deg,
    hsl(var(--muted) / 0.5) 25%,
    hsl(var(--muted) / 0.8) 37%,
    hsl(var(--muted) / 0.5) 63%
  );
  background-size: 400% 100%;
  animation: skeleton-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

.skeleton-shimmer {
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(
    90deg,
    transparent 0%,
    hsl(var(--primary) / 0.05) 50%,
    transparent 100%
  );
  animation: shimmer 1.8s infinite;
}

@keyframes skeleton-pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

@keyframes shimmer {
  100% {
    transform: translateX(100%);
  }
}
</style>
