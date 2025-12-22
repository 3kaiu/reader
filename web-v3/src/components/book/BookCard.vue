<script setup lang="ts">
/**
 * BookCard - shadcn-vue 风格
 */
import { ref, computed } from 'vue'
import { BookOpen, MoreVertical, Trash2 } from 'lucide-vue-next'
import type { Book } from '@/api'
import LazyImage from '@/components/ui/LazyImage.vue'

const props = withDefaults(defineProps<{
  book: Book
  showProgress?: boolean
  manageMode?: boolean
  selected?: boolean
}>(), {
  showProgress: true,
  manageMode: false,
  selected: false,
})

const emit = defineEmits<{
  click: [book: Book]
  delete: [book: Book]
}>()

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
  if (!props.book.coverUrl) return ''
  // 将所有图片请求都通过 cover 接口代理
  return `/reader3/cover?path=${encodeURIComponent(props.book.coverUrl)}`
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
    <!-- 封面容器 -->
    <div 
      class="relative aspect-[2/3] rounded-lg overflow-hidden bg-muted shadow-sm
             transition-all duration-300 ease-out
             group-hover:shadow-lg group-hover:shadow-black/10 dark:group-hover:shadow-black/30
             group-hover:-translate-y-1"
      :class="{ 'ring-2 ring-primary': selected }"
    >
      <!-- 封面图 -->
      <LazyImage
        v-if="coverUrl"
        :src="coverUrl"
        :alt="book.name"
        aspect-ratio="2/3"
        class="w-full h-full transition-transform duration-500 ease-out"
        :class="{ 'group-hover:scale-105': !manageMode }"
      />
      
      <!-- 无封面占位 -->
      <div v-else class="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted-foreground/5">
        <BookOpen class="h-10 w-10 text-muted-foreground/30" />
      </div>
      
      <!-- 悬浮遮罩 (非管理模式) -->
      <div 
        v-if="!manageMode" 
        class="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent 
               opacity-0 group-hover:opacity-100 
               flex items-end justify-center pb-6
               transition-opacity duration-300"
      >
        <span class="text-white text-xs font-medium px-3 py-1.5 bg-white/20 backdrop-blur-sm rounded-full">
          开始阅读
        </span>
      </div>

      <!-- 管理模式复选框 -->
      <div v-if="manageMode" class="absolute inset-0 bg-black/5 flex items-center justify-center">
        <div 
          class="w-7 h-7 rounded-full flex items-center justify-center transition-all"
          :class="selected 
            ? 'bg-primary text-primary-foreground scale-100' 
            : 'bg-white/80 dark:bg-black/50 border-2 border-muted-foreground/30 scale-90'"
        >
          <svg v-if="selected" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="w-4 h-4">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
      </div>
      
      <!-- 未读数角标 -->
      <div
        v-if="unreadCount > 0 && !manageMode"
        class="absolute top-1.5 right-1.5"
      >
        <span 
          class="min-w-[20px] h-5 px-1.5 flex items-center justify-center
                 bg-rose-500 text-white text-[10px] font-bold rounded-full
                 shadow-lg"
        >
          {{ unreadCount > 99 ? '99+' : unreadCount }}
        </span>
      </div>
      
      <!-- 阅读进度条 -->
      <div 
        v-if="showProgress && progress > 0 && !manageMode" 
        class="absolute bottom-0 inset-x-0 h-0.5 bg-black/20"
      >
        <div 
          class="h-full bg-primary transition-all duration-500" 
          :style="{ width: `${progress}%` }" 
        />
      </div>
      
      <!-- 更多菜单按钮 -->
      <button
        v-if="!manageMode"
        class="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/40 backdrop-blur-sm
               flex items-center justify-center
               opacity-0 group-hover:opacity-100 hover:bg-black/60
               transition-opacity"
        @click.stop="showMenu = !showMenu"
      >
        <MoreVertical class="h-3.5 w-3.5 text-white" />
      </button>
      
      <!-- 下拉菜单 -->
      <div
        v-if="showMenu && !manageMode"
        class="absolute top-8 right-1.5 bg-popover border rounded-lg shadow-xl overflow-hidden z-10 min-w-[100px]"
        @click.stop
      >
        <button
          class="flex items-center gap-2 px-3 py-2.5 text-xs text-destructive hover:bg-muted w-full transition-colors"
          @click="handleDelete"
        >
          <Trash2 class="h-3.5 w-3.5" />
          删除书籍
        </button>
      </div>
    </div>
    
    <!-- 书籍信息 -->
    <h3 class="mt-2.5 text-sm font-medium line-clamp-2 leading-snug">{{ book.name }}</h3>
    <p class="text-xs text-muted-foreground truncate mt-1">{{ book.author || '未知作者' }}</p>
  </div>
</template>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
