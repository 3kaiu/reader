<script setup lang="ts">
/**
 * GlassCard - 毛玻璃卡片组件
 * 支持 3D 悬浮效果和多种变体
 */
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  variant?: 'default' | 'dark' | 'subtle'
  hover3d?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
  radius?: 'sm' | 'md' | 'lg' | 'xl'
}>(), {
  variant: 'default',
  hover3d: false,
  padding: 'md',
  radius: 'lg',
})

const glassClass = computed(() => {
  const classes = []
  
  // 毛玻璃变体
  switch (props.variant) {
    case 'dark':
      classes.push('glass-dark')
      break
    case 'subtle':
      classes.push('glass-subtle')
      break
    default:
      classes.push('glass')
  }
  
  // 3D 悬浮效果
  if (props.hover3d) {
    classes.push('card-3d')
  }
  
  // 内边距
  switch (props.padding) {
    case 'none':
      break
    case 'sm':
      classes.push('p-3')
      break
    case 'lg':
      classes.push('p-6')
      break
    default:
      classes.push('p-4')
  }
  
  // 圆角
  switch (props.radius) {
    case 'sm':
      classes.push('rounded-lg')
      break
    case 'md':
      classes.push('rounded-xl')
      break
    case 'xl':
      classes.push('rounded-2xl')
      break
    default:
      classes.push('rounded-xl')
  }
  
  return classes.join(' ')
})
</script>

<template>
  <div :class="glassClass" class="relative overflow-hidden">
    <slot />
  </div>
</template>
