<script setup lang="ts">
/**
 * BookCard - shadcn-vue 风格
 */
import { ref, computed } from 'vue'
import { BookOpen, MoreVertical, Trash2 } from 'lucide-vue-next'
import type { Book } from '@/api'
import { Button } from '@/components/ui/button'

const props = withDefaults(defineProps<{
  book: Book
  showProgress?: boolean
}>(), {
  showProgress: true,
})

const emit = defineEmits<{
  click: [book: Book]
  delete: [book: Book]
}>()

const coverLoaded = ref(false)
const coverError = ref(false)
const showMenu = ref(false)

const progress = computed(() => {
  if (!props.book.totalChapterNum) return 0
  return Math.round((props.book.durChapterIndex || 0) / props.book.totalChapterNum * 100)
})

const unreadCount = computed(() => {
  if (!props.book.totalChapterNum) return 0
  return props.book.totalChapterNum - 1 - (props.book.durChapterIndex || 0)
})

const coverUrl = computed(() => {
  if (props.book.coverUrl) {
    return `/reader3/cover?path=${encodeURIComponent(props.book.coverUrl)}`
  }
  return ''
})

function handleDelete(e: Event) {
  e.stopPropagation()
  showMenu.value = false
  emit('delete', props.book)
}
</script>

<template>
  <div
    class="group cursor-pointer"
    @click="emit('click', book)"
  >
    <!-- 封面 -->
    <div class="relative aspect-[2/3] rounded-lg overflow-hidden bg-muted transition-transform group-hover:-translate-y-1">
      <img
        v-if="coverUrl && !coverError"
        :src="coverUrl"
        :alt="book.name"
        loading="lazy"
        class="w-full h-full object-cover transition-transform group-hover:scale-105"
        @load="coverLoaded = true"
        @error="coverError = true"
      />
      
      <div v-else class="w-full h-full flex items-center justify-center">
        <BookOpen class="h-8 w-8 text-muted-foreground" />
      </div>
      
      <div
        v-if="coverUrl && !coverLoaded && !coverError"
        class="absolute inset-0 bg-muted animate-pulse"
      />
      
      <!-- 悬浮遮罩 -->
      <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
        <span class="text-white text-sm font-medium">阅读</span>
      </div>
      
      <!-- 未读角标 -->
      <div
        v-if="unreadCount > 0"
        class="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center
               bg-destructive text-destructive-foreground text-[10px] font-semibold rounded-full"
      >
        {{ unreadCount > 99 ? '99+' : unreadCount }}
      </div>
      
      <!-- 进度条 -->
      <div v-if="showProgress && progress > 0" class="absolute bottom-0 inset-x-0 h-0.5 bg-muted">
        <div class="h-full bg-primary" :style="{ width: `${progress}%` }" />
      </div>
      
      <!-- 更多菜单 -->
      <Button
        variant="secondary"
        size="icon"
        class="absolute bottom-1.5 right-1.5 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
        @click.stop="showMenu = !showMenu"
      >
        <MoreVertical class="h-3 w-3" />
      </Button>
      
      <div
        v-if="showMenu"
        class="absolute bottom-8 right-1.5 bg-popover border rounded-md shadow-lg overflow-hidden z-10"
        @click.stop
      >
        <button
          class="flex items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-accent w-full"
          @click="handleDelete"
        >
          <Trash2 class="h-3 w-3" />
          删除
        </button>
      </div>
    </div>
    
    <!-- 信息 -->
    <h3 class="mt-2 text-sm font-medium line-clamp-2 leading-tight">{{ book.name }}</h3>
    <p class="text-xs text-muted-foreground truncate mt-0.5">{{ book.author || '未知作者' }}</p>
  </div>
</template>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
