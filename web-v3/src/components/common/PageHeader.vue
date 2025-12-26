<script setup lang="ts">
/**
 * 通用页面头部组件
 * 包含：返回按钮、搜索框（居中）、操作按钮组（右侧）
 */
import { computed } from 'vue'
import { ArrowLeft, Search, X } from 'lucide-vue-next'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface HeaderAction {
  label: string
  icon?: any
  onClick: () => void
  variant?: 'default' | 'outline' | 'ghost' | 'destructive'
  size?: 'sm' | 'md' | 'lg'
  hideLabelOnMobile?: boolean
}

const props = withDefaults(defineProps<{
  searchPlaceholder?: string
  searchValue?: string
  actions?: HeaderAction[]
  showBack?: boolean
  backTo?: string | (() => void)
}>(), {
  searchPlaceholder: '搜索...',
  searchValue: '',
  actions: () => [],
  showBack: true,
  backTo: '/',
})

const emit = defineEmits<{
  'update:searchValue': [value: string]
  'back': []
}>()

const searchModel = computed({
  get: () => props.searchValue,
  set: (value) => emit('update:searchValue', value),
})

function handleBack() {
  if (typeof props.backTo === 'function') {
    props.backTo()
  } else {
    emit('back')
  }
}
</script>

<template>
  <div class="flex items-center gap-3 mb-4">
    <!-- 返回按钮 -->
    <button
      v-if="showBack"
      class="w-10 h-10 rounded-full hover:bg-secondary/80 flex items-center justify-center transition-colors shrink-0"
      @click="handleBack"
      title="返回"
      aria-label="返回"
    >
      <ArrowLeft class="h-5 w-5 text-muted-foreground" />
    </button>

    <!-- 搜索框（居中） -->
    <div class="flex-1 flex justify-center">
      <div class="relative group w-full max-w-md">
        <div
          class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none z-10"
        >
          <Search
            class="h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors"
          />
        </div>
        <Input
          :model-value="searchModel"
          @update:model-value="searchModel = $event"
          class="pl-10 pr-10 h-10 rounded-full bg-secondary/50 border-0 focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:ring-offset-0"
          :placeholder="searchPlaceholder"
        />
        <button
          v-if="searchModel"
          class="absolute inset-y-0 right-0 pr-3 flex items-center z-10"
          @click="searchModel = ''"
          aria-label="清除"
        >
          <X
            class="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors"
          />
        </button>
      </div>
    </div>

    <!-- 操作按钮组（居右） -->
    <div v-if="actions.length > 0" class="flex items-center gap-2 shrink-0">
      <Button
        v-for="(action, index) in actions"
        :key="index"
        :variant="action.variant || 'outline'"
        :size="action.size || 'sm'"
        @click="action.onClick"
      >
        <component :is="action.icon" v-if="action.icon" class="h-4 w-4 mr-2" />
        <span :class="{ 'hidden sm:inline': action.hideLabelOnMobile !== false }">
          {{ action.label }}
        </span>
      </Button>
    </div>
  </div>
</template>
