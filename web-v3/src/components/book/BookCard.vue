<script setup lang="ts">
/**
 * BookCard - shadcn-vue 风格
 */
import { ref, computed } from 'vue'
import { BookOpen, MoreVertical, Trash2, Play } from 'lucide-vue-next'
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
    class="group cursor-pointer relative select-none"
    @click="emit('click', book)"
  >
    <!-- 封面容器 -->
    <div 
      class="relative aspect-[2/3] rounded-xl overflow-hidden bg-muted shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:shadow-none
             transition-all duration-300 ease-out transform
             group-hover:shadow-[0_8px_24px_rgba(0,0,0,0.12)] dark:group-hover:shadow-[0_8px_24px_rgba(0,0,0,0.4)]
             group-active:scale-95
             ring-1 ring-black/5 dark:ring-white/10"
      :class="{ 'ring-2 ring-primary ring-offset-2 ring-offset-background': selected }"
    >
      <!-- 封面图 -->
      <LazyImage
        v-if="coverUrl"
        :src="coverUrl"
        :alt="book.name"
        aspect-ratio="2/3"
        class="w-full h-full transition-all duration-500 ease-out will-change-transform"
        :class="{ 'group-hover:scale-105 group-hover:brightness-[1.05]': !manageMode }"
      />
      
      <!-- 无封面占位 -->
      <div v-else class="w-full h-full flex items-center justify-center bg-secondary/50 border-t border-white/10">
        <BookOpen class="h-8 w-8 text-muted-foreground/20" />
      </div>
      
      <!-- 内边缘高光 (Glassy Highlight) -->
      <div class="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/10 pointer-events-none z-10" />
      
      <!-- 悬浮遮罩 & 按钮 -->
      <div 
        v-if="!manageMode" 
        class="absolute inset-0 bg-black/20 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center pointer-events-none z-20"
      >
        <div class="translate-y-4 group-hover:translate-y-0 transition-transform duration-300 ease-out">
            <span class="px-3 py-1.5 rounded-full bg-background/90 backdrop-blur-md text-foreground text-[10px] font-bold shadow-xl border border-white/10 flex items-center gap-1.5 
                         transition-transform hover:scale-105 active:scale-95 pointer-events-auto">
                <Play class="w-3 h-3 fill-current" v-if="progress > 0" />
                <BookOpen class="w-3 h-3" v-else />
                {{ progress > 0 ? '继续阅读' : '开始阅读' }}
            </span>
        </div>
      </div>

      <!-- 管理模式复选框 -->
      <div v-if="manageMode" class="absolute inset-0 bg-black/10 backdrop-blur-[1px] flex items-center justify-center transition-all duration-300 z-20">
        <div 
          class="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg"
          :class="selected 
            ? 'bg-primary text-primary-foreground scale-110' 
            : 'bg-white/90 dark:bg-black/80 text-muted-foreground scale-100 hover:scale-110'"
        >
          <svg v-if="selected" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="w-4 h-4">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <div v-else class="w-3 h-3 rounded-full border-2 border-current opacity-50" />
        </div>
      </div>
      
      <!-- 未读数角标 -->
      <div
        v-if="unreadCount > 0 && !manageMode"
        class="absolute top-1.5 right-1.5 z-20"
      >
        <span 
          class="min-w-[14px] h-[14px] px-1 flex items-center justify-center
                 bg-red-500/90 backdrop-blur-sm text-white text-[8px] font-bold rounded-full
                 shadow-sm ring-1 ring-white/20"
        >
          {{ unreadCount > 99 ? '99+' : unreadCount }}
        </span>
      </div>
      
      <!-- 阅读进度条 -->
      <div 
        v-if="showProgress && progress > 0 && !manageMode" 
        class="absolute bottom-0 inset-x-0 h-[2px] bg-black/20 backdrop-blur-sm z-10"
      >
        <div 
          class="h-full bg-primary/90 shadow-[0_0_8px_rgba(var(--primary),0.5)] transition-all duration-500" 
          :style="{ width: `${progress}%` }" 
        />
      </div>
      
      <!-- 更多菜单按钮 -->
      <button
        v-if="!manageMode"
        class="absolute top-1.5 left-1.5 w-6 h-6 rounded-full bg-black/30 backdrop-blur-md
               flex items-center justify-center text-white/90
               opacity-0 group-hover:opacity-100 hover:bg-black/50 hover:scale-105
               transition-all duration-200 z-20"
        @click.stop="showMenu = !showMenu"
      >
        <MoreVertical class="h-3 w-3" />
      </button>
      
      <!-- 下拉菜单 -->
      <div
        v-if="showMenu && !manageMode"
        class="absolute top-8 sm:top-10 right-2 w-24 sm:w-28 bg-popover/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden z-30 animate-in fade-in zoom-in-95 duration-200"
        @click.stop
      >
        <button
          class="flex items-center gap-2 px-3 py-2 sm:py-2.5 text-[10px] sm:text-xs font-medium text-destructive hover:bg-destructive/10 w-full transition-colors"
          @click="handleDelete"
        >
          <Trash2 class="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          删除书籍
        </button>
      </div>
    </div>
    
    <!-- 书籍信息 -->
    <div class="mt-2 space-y-0.5 px-0.5">
       <h3 class="text-[13px] font-medium text-foreground/90 leading-snug truncate group-hover:text-primary transition-colors">
         {{ book.name }}
       </h3>
       <p class="text-[11px] text-muted-foreground/70 truncate">
         {{ book.author || '未知著' }}
       </p>
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
