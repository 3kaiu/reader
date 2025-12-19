<script setup lang="ts">
/**
 * SkeletonLoader - 骨架屏加载组件
 * 支持多种预设形状
 */
const props = withDefaults(defineProps<{
  type?: 'text' | 'title' | 'avatar' | 'card' | 'cover' | 'custom'
  width?: string
  height?: string
  lines?: number
  animated?: boolean
}>(), {
  type: 'text',
  lines: 1,
  animated: true,
})

const typeStyles = {
  text: 'h-4 rounded',
  title: 'h-6 w-3/4 rounded',
  avatar: 'w-12 h-12 rounded-full',
  card: 'w-full h-40 rounded-xl',
  cover: 'w-full aspect-[2/3] rounded-xl',
  custom: '',
}
</script>

<template>
  <div class="space-y-2">
    <template v-if="type === 'text' && lines > 1">
      <div
        v-for="i in lines"
        :key="i"
        :class="[
          'skeleton',
          animated ? '' : 'animation-none',
          i === lines ? 'w-2/3' : 'w-full',
        ]"
        class="h-4 rounded"
      />
    </template>
    
    <template v-else-if="type === 'card'">
      <div class="skeleton w-full aspect-[2/3] rounded-xl" />
      <div class="skeleton h-4 w-3/4 rounded mt-3" />
      <div class="skeleton h-3 w-1/2 rounded" />
    </template>
    
    <template v-else>
      <div
        :class="[
          'skeleton',
          animated ? '' : 'animation-none',
          typeStyles[type],
        ]"
        :style="{
          width: width,
          height: height,
        }"
      />
    </template>
  </div>
</template>
