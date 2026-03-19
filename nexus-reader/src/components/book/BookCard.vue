<script setup lang="ts">
/**
 * BookCard - shadcn-vue 风格
 */
import { ref, computed } from 'vue'
import { BookOpen, MoreVertical, Trash2, Play, Cloud, CloudDownload, CheckCircle2 } from 'lucide-vue-next'
import type { Book } from '@/api/book'
import { LazyImage } from '@/components/ui'

const props = withDefaults(defineProps<{
  book: Book
  showProgress?: boolean
  manageMode?: boolean
  selected?: boolean
  cachePercent?: number
  isFullyCached?: boolean
}>(), {
  showProgress: true,
  manageMode: false,
  selected: false,
  cachePercent: 0,
  isFullyCached: false,
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
  return props.book.coverUrl || ''
})

function handleDelete(e: Event) {
  e.stopPropagation()
  showMenu.value = false
  emit('delete', props.book)
}
</script>

<template>
  <div
    class="group cursor-pointer relative select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl interactive"
    @click="emit('click', book)"
    role="button"
    tabindex="0"
    @keydown.enter="emit('click', book)"
    @keydown.space.prevent="emit('click', book)"
    :aria-label="`打开书籍 ${book.name}`"
  >
    <!-- 封面容器 -->
    <div 
      class="relative aspect-[2/3] rounded-xl overflow-hidden bg-muted shadow-premium dark:shadow-none
             transition-all duration-300 ease-out
             group-hover:shadow-[0_8px_24px_rgba(0,0,0,0.12)] dark:group-hover:shadow-[0_8px_32px_rgba(0,0,0,0.5)]
             ring-1 ring-black/5 dark:ring-white/10"
      :class="{ 'ring-2 ring-primary ring-offset-2 ring-offset-background': selected }"
    >
      <!-- 封面图 -->
      <LazyImage
        v-if="coverUrl"
        :src="coverUrl"
        :alt="book.name"
        aspect-ratio="2/3"
        class="w-full h-full object-cover transition-transform duration-500"
      />
      
      <!-- 无封面占位 -->
      <div v-else class="w-full h-full flex items-center justify-center bg-secondary/50 border-t border-white/5">
        <BookOpen class="h-8 w-8 text-muted-foreground/10" />
      </div>
      
      <!-- 精致内边框 (Refined Glossy Highlight) -->
      <div class="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/20 pointer-events-none z-10 opacity-50 dark:opacity-30" />
      
      <!-- 底部滑出的“开始阅读”按钮 -->
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
      

      <!-- 管理模式复选框 -->
      <div v-if="manageMode" class="absolute inset-0 bg-black/20 backdrop-blur-[2px] flex items-center justify-center transition-all duration-300 z-20">
        <div 
          class="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-500 shadow-premium"
          :class="selected 
            ? 'bg-primary text-primary-foreground scale-110' 
            : 'bg-white/90 dark:bg-black/80 text-muted-foreground scale-100 hover:scale-110 ring-1 ring-white/20'"
        >
          <svg v-if="selected" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="w-4 h-4 animate-spring">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <div v-else class="w-3 h-3 rounded-full border-2 border-current opacity-30" />
        </div>
      </div>
      
      <!-- 未读数角标 (更精致的药丸形状) -->
      <div
        v-if="unreadCount > 0 && !manageMode"
        class="absolute top-2 right-2 z-20"
      >
        <span 
          class="min-w-[16px] h-[16px] px-1.5 flex items-center justify-center
                 bg-red-500 text-white text-[9px] font-black rounded-full
                 shadow-premium ring-2 ring-background"
        >
          {{ unreadCount > 99 ? '99+' : unreadCount }}
        </span>
      </div>

      <!-- 缓存状态图标 (轻量化) -->
      <div 
        v-if="cachePercent > 0 && !manageMode"
        class="absolute bottom-2 left-2 z-20 flex items-center"
      >
        <div 
          class="flex items-center gap-1.5 px-2 py-0.5 bg-black/60 backdrop-blur-xl rounded-full border border-white/10 shadow-premium"
          :class="isFullyCached ? 'text-green-400' : 'text-blue-400'"
        >
          <CheckCircle2 v-if="isFullyCached" class="w-2.5 h-2.5" />
          <CloudDownload v-else class="w-2.5 h-2.5 animate-pulse" />
          <span v-if="!isFullyCached" class="text-[9px] font-black tracking-tighter">{{ cachePercent }}%</span>
        </div>
      </div>
      
      <!-- 阅读进度条 (极简悬浮式) -->
      <div 
        v-if="showProgress && progress > 0 && !manageMode" 
        class="absolute bottom-0 inset-x-0 h-1 bg-black/10 z-10"
      >
        <div 
          class="h-full bg-primary transition-all duration-1000 ease-soft" 
          :style="{ width: `${progress}%` }" 
        />
      </div>
      
      <!-- 更多菜单按钮 -->
      <button
        v-if="!manageMode"
        class="absolute top-2 left-2 w-7 h-7 rounded-full bg-black/40 backdrop-blur-xl
               flex items-center justify-center text-white/90
               opacity-0 group-hover:opacity-100 hover:bg-black/60 hover:scale-110 active:scale-90
               transition-all duration-300 z-20"
        @click.stop="showMenu = !showMenu"
        aria-label="更多选项"
      >
        <MoreVertical class="h-3.5 w-3.5" />
      </button>
      
      <!-- 下拉菜单 (Premium Popover) -->
      <div
        v-if="showMenu && !manageMode"
        class="absolute top-10 left-2 w-32 bg-popover/90 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-premium overflow-hidden z-30 animate-in fade-in zoom-in-95 duration-300"
        @click.stop
      >
        <button
          class="flex items-center gap-3 px-4 py-3 text-[11px] font-semibold text-destructive hover:bg-destructive/10 active:bg-destructive/20 w-full transition-colors active:scale-95"
          @click="handleDelete"
        >
          <Trash2 class="h-4 w-4" />
          删除此书
        </button>
      </div>
    </div>
    
    <!-- 书籍信息 (更现代的排版) -->
    <div class="mt-3 space-y-1 px-1">
       <h3 class="text-[14px] font-bold text-foreground/90 leading-tight truncate group-hover:text-primary transition-colors tracking-tight">
         {{ book.name }}
       </h3>
       <div class="flex items-center justify-between">
         <p class="text-[11px] text-muted-foreground/50 truncate font-medium tracking-wide">
           {{ book.author || '未知作者' }}
         </p>
         <span v-if="progress > 0" class="text-[10px] text-primary/40 font-black">{{ progress }}%</span>
       </div>
    </div>
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
