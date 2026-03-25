<script setup lang="ts">
import { BookOpen } from 'lucide-vue-next'
import { LazyImage } from '@/components/ui'

interface Props {
  bookName: string
  coverUrl: string
  manageMode: boolean
  selected: boolean
}

defineProps<Props>()
</script>

<template>
  <LazyImage
    v-if="coverUrl"
    :src="coverUrl"
    :alt="bookName"
    aspect-ratio="2/3"
    class="w-full h-full object-cover transition-transform duration-500"
  />

  <div
    v-else
    class="w-full h-full flex items-center justify-center bg-secondary/50 border-t border-white/5"
  >
    <BookOpen class="h-8 w-8 text-muted-foreground/10" />
  </div>

  <div
    class="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/20 pointer-events-none z-10 opacity-50 dark:opacity-30"
  />

  <div
    v-if="!manageMode"
    class="absolute inset-x-0 bottom-4 flex justify-center pointer-events-none z-20"
  >
    <div
      class="px-4 py-2 bg-primary text-primary-foreground rounded-full flex items-center justify-center gap-2 shadow-xl shadow-primary/30 
             translate-y-8 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500 ease-out"
    >
      <BookOpen class="w-4 h-4" />
      <span class="text-[11px] font-bold whitespace-nowrap">开始阅读</span>
    </div>
  </div>

  <div
    v-if="manageMode"
    class="absolute inset-0 bg-black/20 backdrop-blur-[2px] flex items-center justify-center transition-all duration-300 z-20"
  >
    <div
      class="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-500 shadow-premium"
      :class="selected
        ? 'bg-primary text-primary-foreground scale-110'
        : 'bg-white/90 dark:bg-black/80 text-muted-foreground scale-100 hover:scale-110 ring-1 ring-white/20'"
    >
      <svg
        v-if="selected"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        class="w-4 h-4 animate-spring"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <div v-else class="w-3 h-3 rounded-full border-2 border-current opacity-30" />
    </div>
  </div>
</template>
