<script setup lang="ts">
/**
 * 通用空状态组件
 */
import { Button } from '@/components/ui/button'

const props = withDefaults(defineProps<{
  icon?: any
  title: string
  description?: string
  actions?: Array<{
    label: string
    onClick: () => void
    variant?: 'default' | 'outline' | 'ghost' | 'destructive'
    icon?: any
  }>
}>(), {
  description: '',
  actions: () => [],
})

</script>

<template>
  <div
    class="flex flex-col items-center justify-center py-20 text-center animate-in fade-in zoom-in-95 duration-500"
  >
    <!-- 图标 -->
    <div
      v-if="icon || $slots.icon"
      class="w-20 h-20 rounded-2xl bg-muted/30 flex items-center justify-center mb-6"
    >
      <component v-if="icon" :is="icon" class="h-10 w-10 text-muted-foreground/40" />
      <slot v-else name="icon" />
    </div>

    <!-- 标题 -->
    <h3 class="text-lg font-semibold mb-2 text-foreground">
      {{ title }}
    </h3>

    <!-- 描述 -->
    <p
      v-if="description || $slots.description"
      class="text-muted-foreground text-sm mb-8 max-w-xs mx-auto leading-relaxed"
    >
      <template v-if="description">{{ description }}</template>
      <slot v-else name="description" />
    </p>

    <!-- 操作按钮 -->
    <div v-if="actions.length > 0" class="flex gap-3">
      <Button
        v-for="(action, index) in actions"
        :key="index"
        :variant="action.variant || 'default'"
        @click="action.onClick"
      >
        <component :is="action.icon" v-if="action.icon" class="h-4 w-4 mr-2" />
        {{ action.label }}
      </Button>
    </div>

    <!-- 自定义内容插槽 -->
    <slot />
  </div>
</template>
