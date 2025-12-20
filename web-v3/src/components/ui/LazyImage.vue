<script setup lang="ts">
/**
 * LazyImage - 懒加载图片组件
 * 使用 Intersection Observer 实现视口内加载
 * 支持骨架屏占位、错误状态优雅降级
 */
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { BookOpen } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  src: string
  alt?: string
  fallbackIcon?: boolean
  aspectRatio?: string
  class?: string
}>(), {
  alt: '',
  fallbackIcon: true,
  aspectRatio: '2/3',
})

const emit = defineEmits<{
  load: []
  error: []
}>()

// 状态
const containerRef = ref<HTMLElement | null>(null)
const isInView = ref(false)
const isLoaded = ref(false)
const hasError = ref(false)

// 只有在视口内时才加载图片
const shouldLoad = computed(() => isInView.value && props.src)

// Intersection Observer
let observer: IntersectionObserver | null = null

onMounted(() => {
  if (!containerRef.value) return
  
  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          isInView.value = true
          // 一旦进入视口就断开观察
          observer?.disconnect()
        }
      })
    },
    {
      rootMargin: '100px', // 提前100px开始加载
      threshold: 0
    }
  )
  
  observer.observe(containerRef.value)
})

onUnmounted(() => {
  observer?.disconnect()
})

function handleLoad() {
  isLoaded.value = true
  emit('load')
}

function handleError() {
  hasError.value = true
  emit('error')
}
</script>

<template>
  <div 
    ref="containerRef"
    class="lazy-image-container relative overflow-hidden bg-muted"
    :class="props.class"
    :style="{ aspectRatio }"
  >
    <!-- 骨架屏占位 -->
    <div 
      v-if="!isLoaded && !hasError"
      class="absolute inset-0 skeleton-loading"
    />
    
    <!-- 实际图片 -->
    <img
      v-if="shouldLoad && !hasError"
      :src="src"
      :alt="alt"
      loading="lazy"
      class="w-full h-full object-cover transition-opacity duration-300"
      :class="{ 'opacity-0': !isLoaded, 'opacity-100': isLoaded }"
      @load="handleLoad"
      @error="handleError"
    />
    
    <!-- 错误状态 / 默认图标 -->
    <div 
      v-if="hasError || !src"
      class="absolute inset-0 flex items-center justify-center"
    >
      <slot name="fallback">
        <BookOpen v-if="fallbackIcon" class="h-8 w-8 text-muted-foreground" />
      </slot>
    </div>
  </div>
</template>

<style scoped>
.skeleton-loading {
  background: linear-gradient(
    90deg,
    hsl(var(--muted)) 0%,
    hsl(var(--muted) / 0.5) 50%,
    hsl(var(--muted)) 100%
  );
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s ease-in-out infinite;
}

@keyframes skeleton-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>
