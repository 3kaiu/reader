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
  isCustomTheme: boolean
  customThemeBackground: string
  customThemeText: string
}

defineProps<Props>()

const emit = defineEmits<{
  'select-theme': [theme: ReaderTheme]
  'update-custom-background': [value: string]
  'update-custom-text': [value: string]
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
        :class="currentTheme === theme.key
          ? 'border-primary scale-105 shadow-md'
          : 'border-border'"
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
      <button
        class="w-14 h-14 rounded-xl border-2 transition-all hover:scale-105 active:scale-95 flex items-center justify-center text-xs font-medium relative overflow-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        :class="currentTheme === 'custom'
          ? 'border-primary scale-105 shadow-md'
          : 'border-border'"
        :style="{
          backgroundColor: customThemeBackground,
          color: customThemeText,
        }"
        aria-label="切换到自定义主题"
        :aria-pressed="currentTheme === 'custom'"
        @click="emit('select-theme', 'custom')"
      >
        自定
      </button>
    </div>

    <div v-if="isCustomTheme" class="mt-4 p-4 rounded-xl bg-muted/50 space-y-4">
      <div class="flex items-center justify-between">
        <span class="text-sm">背景色</span>
        <div class="flex items-center gap-2">
          <input
            :value="customThemeBackground"
            type="color"
            class="w-10 h-10 rounded-lg cursor-pointer border-0"
            @input="emit('update-custom-background', ($event.target as HTMLInputElement).value)"
          />
          <span class="text-xs text-muted-foreground font-mono">
            {{ customThemeBackground }}
          </span>
        </div>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-sm">文字色</span>
        <div class="flex items-center gap-2">
          <input
            :value="customThemeText"
            type="color"
            class="w-10 h-10 rounded-lg cursor-pointer border-0"
            @input="emit('update-custom-text', ($event.target as HTMLInputElement).value)"
          />
          <span class="text-xs text-muted-foreground font-mono">
            {{ customThemeText }}
          </span>
        </div>
      </div>
    </div>
  </section>
</template>
