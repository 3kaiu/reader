<script setup lang="ts">
import { Library, Moon, Search, Settings, Sun } from 'lucide-vue-next'
import type { BookshelfMenuGroup } from '@/constants/bookshelf'
import BookshelfMenuPanel from './BookshelfMenuPanel.vue'

defineProps<{
  isDark: boolean
  hasBooks: boolean
  isManageMode: boolean
  menuOpen: boolean
  isDesktop: boolean
  menuGroups: BookshelfMenuGroup[]
}>()

const emit = defineEmits<{
  'update:menuOpen': [value: boolean]
  toggleDark: []
  search: []
  toggleManageMode: []
  navigate: [path: string]
}>()
</script>

<template>
  <div class="fixed top-0 left-0 right-0 z-40 pointer-events-none pt-safe-top">
    <div class="px-4 sm:px-6 h-[60px] flex items-center justify-between max-w-7xl mx-auto">
      <div class="flex items-center gap-2 shrink-0 pointer-events-auto">
        <Library class="h-5 w-5 text-primary" />
        <span class="font-bold text-lg text-foreground tracking-tight">阅读</span>
      </div>

      <div class="flex items-center gap-3 shrink-0 pointer-events-auto">
        <button
          class="flex items-center justify-center transition-opacity hover:opacity-70 active:scale-90"
          @click="emit('toggleDark')"
          aria-label="切换主题"
        >
          <Sun v-if="!isDark" class="h-5 w-5 text-foreground" />
          <Moon v-else class="h-5 w-5 text-foreground" />
        </button>

        <button
          class="flex items-center justify-center transition-opacity hover:opacity-70 active:scale-90"
          @click="emit('search')"
          aria-label="搜索"
        >
          <Search class="h-5 w-5 text-foreground" />
        </button>

        <button
          v-if="hasBooks"
          class="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          @click="emit('toggleManageMode')"
        >
          {{ isManageMode ? '完成' : '管理' }}
        </button>

        <BookshelfMenuPanel
          :open="menuOpen"
          :is-desktop="isDesktop"
          :menu-groups="menuGroups"
          @update:open="emit('update:menuOpen', $event)"
          @navigate="emit('navigate', $event)"
        >
          <button
            class="flex items-center justify-center transition-opacity hover:opacity-70 active:scale-90 outline-none"
            aria-label="设置"
          >
            <Settings class="h-5 w-5 text-foreground" />
          </button>
        </BookshelfMenuPanel>
      </div>
    </div>
  </div>
</template>
