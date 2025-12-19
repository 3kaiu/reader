<script setup lang="ts">
/**
 * FloatingButton - 浮动按钮组件
 * 支持图标、工具提示、多种样式
 */
import { ref } from 'vue'

const props = withDefaults(defineProps<{
  icon?: string
  tooltip?: string
  variant?: 'primary' | 'accent' | 'ghost' | 'glass'
  size?: 'sm' | 'md' | 'lg'
  circle?: boolean
}>(), {
  variant: 'glass',
  size: 'md',
  circle: true,
})

const emit = defineEmits<{
  click: [e: MouseEvent]
}>()

const showTooltip = ref(false)

const sizeClasses = {
  sm: 'w-8 h-8 text-sm',
  md: 'w-10 h-10 text-base',
  lg: 'w-12 h-12 text-lg',
}

const variantClasses = {
  primary: 'btn-primary',
  accent: 'btn-accent',
  ghost: 'btn-ghost',
  glass: 'glass hover:bg-white/90 dark:hover:bg-slate-800/90',
}
</script>

<template>
  <button
    :class="[
      sizeClasses[size],
      variantClasses[variant],
      circle ? 'rounded-full' : 'rounded-xl',
      'relative inline-flex items-center justify-center',
      'transition-all duration-200',
      'active:scale-95',
      'shadow-lg hover:shadow-xl',
    ]"
    @click="emit('click', $event)"
    @mouseenter="showTooltip = true"
    @mouseleave="showTooltip = false"
  >
    <slot>
      <span v-if="icon" class="text-current">{{ icon }}</span>
    </slot>
    
    <!-- Tooltip -->
    <Transition name="tooltip">
      <div
        v-if="tooltip && showTooltip"
        class="absolute -bottom-10 left-1/2 -translate-x-1/2 
               px-2 py-1 text-xs text-white bg-gray-800 rounded-md
               whitespace-nowrap z-50 shadow-lg"
      >
        {{ tooltip }}
        <div class="absolute -top-1 left-1/2 -translate-x-1/2 
                    w-2 h-2 bg-gray-800 rotate-45" />
      </div>
    </Transition>
  </button>
</template>

<style scoped>
.tooltip-enter-active,
.tooltip-leave-active {
  transition: all 0.15s ease;
}

.tooltip-enter-from,
.tooltip-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(5px);
}
</style>
