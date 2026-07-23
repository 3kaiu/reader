<script setup lang="ts">
import { SceneLoader } from '@/components/ui'
import { createReaderScrollChapterViewBindings } from './reader-scroll-chapter-view-bindings'
import type { ReaderScrollChapterProps } from './reader-scroll-chapter-prop-types'

const props = defineProps<ReaderScrollChapterProps>()
const {
  chapterIndex,
  chapterOrder,
  chapterTitle,
  chapterContainerStyle,
  hasFormattedContent,
  renderedContent,
  onContentClick,
} = createReaderScrollChapterViewBindings(props)
</script>

<template>
  <div class="reader-chapter-block" :style="chapterContainerStyle">
    <div
      class="chapter-marker text-center py-10 mt-10 first:mt-0"
      :data-chapter-index="chapterIndex"
    >
      <div class="inline-block px-6 py-2 bg-primary/5 rounded-full mb-4">
        <span class="text-xs opacity-60">第 {{ chapterOrder }} 章</span>
      </div>
      <h2 class="chapter-title text-xl font-bold opacity-90">
        {{ chapterTitle }}
      </h2>
    </div>

    <article class="reader-text" @click="onContentClick">
      <!-- v-html is safe here: content is pre-sanitized via DOMPurify + HTML entity escaping
           in the rendering pipeline before reaching this component. See: ReaderContentFormatter -->
      <div v-if="hasFormattedContent" v-html="renderedContent" />
      <div v-else class="py-10 text-center opacity-40">
        <SceneLoader scene="readerChapter" :size="36" class="mx-auto mb-2 opacity-40" />
        <p class="text-xs">正在解析内容...</p>
      </div>
    </article>
  </div>
</template>
