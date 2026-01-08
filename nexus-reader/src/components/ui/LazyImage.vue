<script setup lang="ts">
/**
 * LazyImage - 懒加载图片组件
 * 使用 Intersection Observer 实现视口内加载
 * 支持骨架屏占位、错误状态优雅降级
 */
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { BookOpen, AlertCircle } from 'lucide-vue-next'
import { LAZY_IMAGE_ROOT_MARGIN } from '@/constants/ui'
import Skeleton from './Skeleton.vue'

const props = withDefaults(defineProps<{
  src: string
  alt?: string
  fallbackIcon?: boolean
  aspectRatio?: string
  class?: string
  /** 强制显示 Skeleton (手动测试用) */
  loading?: boolean
  /** 最大宽度（像素），用于限制图片尺寸 */
  maxWidth?: number
  /** 图片质量（0-100），用于优化加载 */
  quality?: number
}>(), {
  alt: '',
  fallbackIcon: true,
  aspectRatio: '2/3',
  loading: false,
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
 */
const optimizedSrc = computed(() => {
  if (!props.src) return ''
  
  let url = props.src
  
  // 如果支持 WebP 且是 jpg/jpeg 格式，尝试使用 WebP
  // 注意：出于稳定性考虑，对于未知第三方 CDN 默认不开启盲目替换，除非明确知道支持
  /*
  if (checkWebPSupport() && /\.(jpg|jpeg)$/i.test(url)) {
    url = url.replace(/\.(jpg|jpeg)$/i, '.webp')
  }
  */
  
  const params = new URLSearchParams()
  if (props.maxWidth) params.set('width', String(props.maxWidth))
  if (props.quality !== undefined) params.set('quality', String(props.quality))
  
  if (params.toString()) {
    const separator = url.includes('?') ? '&' : '?'
    url = `${url}${separator}${params.toString()}`
  }
  
  return url
})

const currentSrc = ref(optimizedSrc.value)
watch(optimizedSrc, (newSrc) => {
  currentSrc.value = newSrc
})

// 只要 src 存在且处于视口内，就应当加载
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
    { rootMargin: LAZY_IMAGE_ROOT_MARGIN }
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

function handleImageError() {
  // WebP 加载失败时 fallback 到原图
  if (currentSrc.value !== props.src) {
    currentSrc.value = props.src
  } else {
    hasError.value = true
    emit('error')
  }
}
</script>

<template>
  <div 
    ref="containerRef"
    class="lazy-image-root relative overflow-hidden bg-muted/30"
    :class="props.class"
    :style="{ aspectRatio }"
  >
    <!-- 骨架屏占位 -->
    <Skeleton
      v-if="(!isLoaded || props.loading) && !hasError"
      width="100%"
      height="100%"
      class-name="absolute inset-0 z-[1]"
    />
    
    <!-- 实际图片 -->
    <img
      v-if="shouldLoad && !hasError"
      :src="currentSrc"
      :alt="alt"
      loading="lazy"
      decoding="async"
      class="w-full h-full object-cover transition-all duration-700 ease-out will-change-transform"
      :class="[
        isLoaded && !props.loading ? 'opacity-100 scale-100 blur-0' : 'opacity-0 scale-110 blur-sm'
      ]"
      @load="handleLoad"
      @error="handleImageError"
    />
    
    <!-- 错误状态 -->
    <div 
      v-if="hasError || !src"
      class="absolute inset-0 flex items-center justify-center bg-muted/10"
    >
      <slot name="fallback">
        <div class="flex flex-col items-center gap-1 opacity-20">
          <AlertCircle v-if="hasError" class="h-6 w-6" />
          <BookOpen v-else class="h-6 w-6" />
        </div>
      </slot>
    </div>
  </div>
</template>
