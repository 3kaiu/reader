<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'
import type { ReaderLoadedChapter } from './content-types'

defineProps<{
  chapter: ReaderLoadedChapter
  highlightContent: (content: string | undefined) => string
  handleContentClick: (event: MouseEvent) => void
}>()
</script>

<template>
  <div
    class="chapter-marker text-center py-10 mt-10 first:mt-0"
    :data-chapter-index="chapter.index"
  >
    <div class="inline-block px-6 py-2 bg-primary/5 rounded-full mb-4">
      <span class="text-xs opacity-60">第 {{ chapter.index + 1 }} 章</span>
    </div>
    <h2 class="chapter-title text-xl font-bold opacity-90">
      {{ chapter.title }}
    </h2>
  </div>

  <article class="reader-text" @click="handleContentClick">
    <div
      v-if="chapter.formattedContent"
      v-html="highlightContent(chapter.formattedContent)"
    />
    <div v-else class="py-10 text-center opacity-40">
      <Loader2 class="w-6 h-6 animate-spin mx-auto mb-2" />
      <p class="text-xs">正在解析内容...</p>
    </div>
  </article>
</template>
