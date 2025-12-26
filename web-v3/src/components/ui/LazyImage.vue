<script setup lang="ts">
/**
 * LazyImage - 懒加载图片组件
 * 使用 Intersection Observer 实现视口内加载
 * 支持骨架屏占位、错误状态优雅降级
 */
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { BookOpen } from 'lucide-vue-next'
import { LAZY_IMAGE_ROOT_MARGIN } from '@/constants/ui'

const props = withDefaults(defineProps<{
  src: string
  alt?: string
  fallbackIcon?: boolean
  aspectRatio?: string
  class?: string
  /** 最大宽度（像素），用于限制图片尺寸 */
  maxWidth?: number
  /** 图片质量（0-100），用于优化加载 */
  quality?: number
}>(), {
  alt: '',
  fallbackIcon: true,
  aspectRatio: '2/3',
  maxWidth: undefined,
  quality: undefined,
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

// WebP 支持检测（缓存结果）
let webpSupported: boolean | null = null
function checkWebPSupport(): boolean {
  if (webpSupported !== null) return webpSupported
  
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    webpSupported = canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0
  } catch {
    webpSupported = false
  }
  
  return webpSupported
}

/**
 * 优化图片 URL
 * 支持 WebP 格式和尺寸参数（如果服务器支持）
 */
const optimizedSrc = computed(() => {
  if (!props.src) return ''
  
  let url = props.src
  
  // 如果支持 WebP 且是 jpg/jpeg 格式，尝试使用 WebP
  // 注意：需要服务器支持 WebP 格式，否则会 fallback 到原图
  if (checkWebPSupport() && /\.(jpg|jpeg)$/i.test(url)) {
    url = url.replace(/\.(jpg|jpeg)$/i, '.webp')
  }
  
  // 添加尺寸和质量参数（如果服务器 API 支持）
  // 注意：这里假设 API 支持 width 和 quality 参数
  // 如果 API 不支持，这些参数会被忽略
  const params = new URLSearchParams()
  if (props.maxWidth) {
    params.set('width', String(props.maxWidth))
  }
  if (props.quality !== undefined) {
    params.set('quality', String(props.quality))
  }
  
  if (params.toString()) {
    const separator = url.includes('?') ? '&' : '?'
    url = `${url}${separator}${params.toString()}`
  }
  
  return url
})

// WebP 加载失败时 fallback 到原图
const currentSrc = ref(optimizedSrc.value)
watch(optimizedSrc, (newSrc) => {
  currentSrc.value = newSrc
})

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
      rootMargin: LAZY_IMAGE_ROOT_MARGIN, // 提前加载距离
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
      :src="currentSrc"
      :alt="alt"
      loading="lazy"
      decoding="async"
      class="w-full h-full object-cover transition-opacity duration-300"
      :class="{ 'opacity-0': !isLoaded, 'opacity-100': isLoaded }"
      :style="maxWidth ? { maxWidth: `${maxWidth}px` } : undefined"
      @load="handleLoad"
      @error="() => {
        // WebP 加载失败时 fallback 到原图
        if (currentSrc.value !== props.src) {
          currentSrc.value = props.src
        } else {
          handleError()
        }
      }"
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
