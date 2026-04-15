<script setup lang="ts">
import type { ReaderTheme } from '@/types/settings'

interface ThemeOption {
  key: ReaderTheme
  label: string
  color: string
  textColor?: string
}

interface Props {
  currentTheme: ReaderTheme
  themes: ThemeOption[]
}

defineProps<Props>()

const emit = defineEmits<{
  'select-theme': [theme: ReaderTheme]
}>()
</script>

<template>
  <section>
    <h3 class="text-sm font-medium mb-3">阅读主题</h3>
    <div class="flex gap-2 flex-wrap">
      <button
        v-for="theme in themes"
        :key="theme.key"
        class="w-14 h-14 rounded-xl border-2 transition-all hover:scale-105 active:scale-95 flex items-center justify-center text-xs font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        :class="currentTheme === theme.key ? 'border-primary scale-105 shadow-md' : 'border-border'"
        :style="{
          backgroundColor: theme.color,
          color: theme.textColor || '#333',
        }"
        :aria-label="`切换到${theme.label}主题`"
        :aria-pressed="currentTheme === theme.key"
        @click="emit('select-theme', theme.key)"
      >
        {{ theme.label }}
      </button>
    </div>
  </section>
</template>
