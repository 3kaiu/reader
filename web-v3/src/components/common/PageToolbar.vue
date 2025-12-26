<script setup lang="ts">
/**
 * 通用页面工具栏组件
 * 包含：标题、统计信息、批量管理按钮
 */
import { computed } from 'vue'
import { CheckSquare } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'

interface StatItem {
  label: string
  value: number | string
  icon?: any
  color?: string
}

const props = withDefaults(defineProps<{
  title: string
  icon?: any
  stats?: StatItem[]
  count?: number
  isManageMode?: boolean
  showManageButton?: boolean
}>(), {
  stats: () => [],
  count: 0,
  isManageMode: false,
  showManageButton: true,
})

const emit = defineEmits<{
  'toggle-manage': []
}>()
</script>

<template>
  <div class="flex items-center gap-3 mb-6">
    <!-- 标题 -->
    <div class="flex items-center gap-2 shrink-0">
      <component :is="icon" v-if="icon" class="w-4 h-4 text-primary" />
      <h2
        class="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2"
      >
        {{ title }}
        <span
          v-if="count !== undefined"
          class="text-xs font-normal text-muted-foreground/60 normal-case"
        >
          ({{ count }})
        </span>
      </h2>
    </div>

    <div class="flex-1"></div>

    <!-- 统计信息 -->
    <div
      v-if="stats.length > 0"
      class="flex items-center gap-3 shrink-0"
    >
      <div
        v-for="(stat, index) in stats"
        :key="index"
        class="flex items-center gap-2 text-sm text-muted-foreground bg-muted px-3 py-1.5 rounded-md border border-border"
      >
        <span
          v-if="stat.color"
          class="w-1.5 h-1.5 rounded-full"
          :style="{ backgroundColor: stat.color }"
        ></span>
        <component :is="stat.icon" v-if="stat.icon && !stat.color" class="w-4 h-4" />
        <span>{{ stat.label }} {{ stat.value }}</span>
      </div>
    </div>

    <!-- 批量管理按钮 -->
    <Button
      v-if="showManageButton"
      variant="outline"
      @click="emit('toggle-manage')"
      :class="
        isManageMode && 'bg-primary/10 text-primary border-primary/20'
      "
      class="shrink-0"
    >
      <CheckSquare class="h-4 w-4 mr-2" />
      <span class="hidden sm:inline">{{
        isManageMode ? '退出管理' : '批量管理'
      }}</span>
    </Button>
  </div>
</template>
