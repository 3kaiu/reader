<script setup lang="ts">
import { Search, X } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

withDefaults(
  defineProps<{
    modelValue: string
    variant?: 'hero' | 'results'
    showSearchButton?: boolean
    showStopButton?: boolean
    autofocus?: boolean
  }>(),
  {
    variant: 'results',
    showSearchButton: false,
    showStopButton: false,
    autofocus: false,
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  search: []
  stop: []
}>()
</script>

<template>
  <div :class="showSearchButton || showStopButton ? 'flex items-center gap-3' : 'block'">
    <div class="flex-1 relative group">
      <div class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none z-10">
        <Search
          class="h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors"
        />
      </div>
      <Input
        :model-value="modelValue"
        @update:model-value="emit('update:modelValue', $event)"
        :class="
          variant === 'hero'
            ? 'pl-10 pr-10 h-10 rounded-full bg-secondary/50 border-0 focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:ring-offset-0'
            : 'pl-10 pr-10 h-10 rounded-full border-0 focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:ring-offset-0 shadow-lg backdrop-blur-sm bg-background/90'
        "
        placeholder="搜索书名或作者..."
        @keyup.enter="emit('search')"
        :autofocus="autofocus"
      />
      <button
        v-if="modelValue"
        class="absolute inset-y-0 right-0 pr-3 flex items-center z-10"
        @click="emit('update:modelValue', '')"
        aria-label="清除"
      >
        <X class="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
      </button>
    </div>

    <Button
      v-if="showSearchButton"
      variant="outline"
      size="sm"
      class="rounded-full shrink-0 min-w-[80px]"
      @click="emit('search')"
    >
      搜索
    </Button>

    <Button
      v-if="showStopButton"
      variant="destructive"
      size="sm"
      @click="emit('stop')"
      :class="variant === 'hero' ? 'rounded-full shrink-0' : 'rounded-full text-xs h-7 px-3'"
      aria-label="停止搜索"
    >
      {{ variant === 'hero' ? '停止' : '停止搜索' }}
    </Button>
  </div>
</template>
