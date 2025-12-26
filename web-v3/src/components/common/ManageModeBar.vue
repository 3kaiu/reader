<script setup lang="ts">
/**
 * 通用管理模式底部栏组件
 * 包含：全选、已选数量、操作按钮、关闭
 */
import { computed } from 'vue'
import { CheckSquare, X, Trash2 } from 'lucide-vue-next'

interface ManageAction {
  icon: any
  onClick: () => void
  disabled?: boolean
  title: string
  variant?: 'default' | 'danger'
}

const props = withDefaults(defineProps<{
  selectedCount: number
  totalCount: number
  actions?: ManageAction[]
  showDelete?: boolean
}>(), {
  selectedCount: 0,
  totalCount: 0,
  actions: () => [],
  showDelete: true,
})

const emit = defineEmits<{
  'select-all': []
  'delete': []
  'close': []
}>()

const isAllSelected = computed(() => props.selectedCount === props.totalCount && props.totalCount > 0)
</script>

<template>
  <Transition
    enter-active-class="transition duration-300 cubic-bezier(0.34, 1.56, 0.64, 1)"
    enter-from-class="translate-y-20 opacity-0 scale-90"
    enter-to-class="translate-y-0 opacity-100 scale-100"
    leave-active-class="transition duration-200 ease-in"
    leave-from-class="translate-y-0 opacity-100 scale-100"
    leave-to-class="translate-y-20 opacity-0 scale-90"
  >
    <div
      class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-auto max-w-[95vw]"
    >
      <div
        class="bg-background/95 dark:bg-background/95 backdrop-blur-xl border border-border shadow-2xl rounded-full px-3 py-2 flex items-center gap-2 text-foreground"
      >
        <!-- 全选按钮 -->
        <button
          class="h-9 px-4 rounded-full hover:bg-muted flex items-center gap-2 transition-colors active:scale-95 font-medium text-sm"
          @click="emit('select-all')"
        >
          <CheckSquare class="h-4 w-4" />
          <span>{{ isAllSelected ? '取消全选' : '全选' }}</span>
        </button>

        <div class="w-px h-6 bg-border mx-1"></div>

        <!-- 已选数量 -->
        <span
          class="text-xs font-medium px-2 text-muted-foreground tabular-nums"
        >
          已选 {{ selectedCount }}
        </span>

        <div class="w-px h-6 bg-border mx-1"></div>

        <!-- 自定义操作按钮 -->
        <template v-for="(action, index) in actions" :key="index">
          <button
            class="w-9 h-9 rounded-full hover:bg-muted flex items-center justify-center transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            :class="
              action.variant === 'danger'
                ? 'hover:bg-destructive/10 text-destructive hover:text-destructive'
                : ''
            "
            :title="action.title"
            :disabled="action.disabled || selectedCount === 0"
            @click="action.onClick"
          >
            <component :is="action.icon" class="h-4 w-4" />
          </button>
        </template>

        <!-- 删除按钮 -->
        <button
          v-if="showDelete"
          class="w-9 h-9 rounded-full hover:bg-destructive/10 text-destructive hover:text-destructive flex items-center justify-center transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          title="删除选中"
          :disabled="selectedCount === 0"
          @click="emit('delete')"
        >
          <Trash2 class="h-4 w-4" />
        </button>

        <!-- 关闭按钮 -->
        <button
          class="w-9 h-9 rounded-full hover:bg-muted flex items-center justify-center transition-colors ml-1 active:scale-95"
          @click="emit('close')"
          title="退出管理"
        >
          <X class="h-4 w-4" />
        </button>
      </div>
    </div>
  </Transition>
</template>
