<script setup lang="ts">
/**
 * LazyImage - 懒加载图片组件
 * 使用 Intersection Observer 实现视口内加载
 * 支持骨架屏占位、错误状态优雅降级
 */
import type { LazyImageProps } from '@/components/ui/lazy-image/types'
import { useLazyImage } from '@/components/ui/lazy-image/useLazyImage'
import { BookOpen, AlertCircle } from 'lucide-vue-next'
import Skeleton from './Skeleton.vue'

const props = withDefaults(defineProps<LazyImageProps>(), {
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

const {
  containerRef,
  isLoaded,
  hasError,
  currentSrc,
  shouldLoad,
  handleLoad,
  handleImageError,
} = useLazyImage(props, emit)
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
