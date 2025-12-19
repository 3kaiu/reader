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
    <!-- 封面 -->
    <div 
      class="relative aspect-[2/3] rounded-xl overflow-hidden bg-muted 
             transition-all duration-500 cubic-bezier(0.34, 1.56, 0.64, 1)
             group-hover:-translate-y-2 group-hover:scale-[1.02] 
             group-hover:shadow-2xl group-hover:shadow-primary/20
             after:absolute after:inset-0 after:rounded-xl after:border after:border-black/5 after:pointer-events-none"
      :class="{ 'ring-2 ring-primary ring-offset-2 ring-offset-background': selected }"
    >
      <img
        v-if="coverUrl && !coverError"
        :src="coverUrl"
        :alt="book.name"
        loading="lazy"
        class="w-full h-full object-cover transition-transform duration-700 ease-out"
        :class="{ 'group-hover:scale-105': !manageMode }"
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
      
      <!-- 悬浮遮罩 (仅在非管理模式下显示) -->
      <div v-if="!manageMode" class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-300 backdrop-blur-[2px]">
        <div class="px-5 py-2.5 bg-white/10 backdrop-blur-md text-white text-sm font-medium rounded-full border border-white/20 transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300 shadow-xl">
          开始阅读
        </div>
      </div>

      <!-- 管理模式勾选蒙层 -->
      <div v-if="manageMode" class="absolute inset-0 bg-black/10 flex items-center justify-center transition-opacity" :class="{ 'bg-black/30': selected }">
        <div 
          class="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors"
          :class="selected ? 'bg-primary border-primary' : 'border-white/80 bg-black/20'"
        >
          <svg v-if="selected" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5 text-primary-foreground"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
      </div>
      
      <!-- 更新角标 (非管理模式) -->
      <div
        v-if="unreadCount > 0 && !manageMode"
        class="absolute top-2 right-2 flex items-center justify-center"
      >
        <span 
          class="min-w-[18px] h-[18px] px-1.5 flex items-center justify-center
                 bg-rose-500 text-white text-[10px] font-bold rounded-full
                 shadow-sm ring-2 ring-white dark:ring-stone-900"
        >
          {{ unreadCount > 99 ? '99+' : unreadCount }}
        </span>
      </div>
      
      <!-- 进度条 (非管理模式) -->
      <div v-if="showProgress && progress > 0 && !manageMode" class="absolute bottom-0 inset-x-0 h-1 bg-black/20 backdrop-blur-sm">
        <div 
          class="h-full bg-gradient-to-r from-emerald-400 to-cyan-400 rounded-r-full transition-all duration-500" 
          :style="{ width: `${progress}%` }" 
        />
        <span class="absolute right-1 bottom-1.5 text-[9px] text-white/90 font-medium drop-shadow">{{ progress }}%</span>
      </div>
      
      <!-- 更多菜单 (非管理模式) -->
      <Button
        v-if="!manageMode"
        variant="secondary"
        size="icon"
        class="absolute bottom-1.5 right-1.5 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
        @click.stop="showMenu = !showMenu"
      >
        <MoreVertical class="h-3 w-3" />
      </Button>
      
      <div
        v-if="showMenu && !manageMode"
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
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
