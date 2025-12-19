<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import { 
  Search, ArrowDown, ArrowUp, Locate, RotateCw, X
} from 'lucide-vue-next'
import { useVirtualList } from '@vueuse/core'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle,
  SheetClose
} from '@/components/ui/sheet'
import { SkeletonLoader } from '@/components/ui'
import { useMessage } from '@/composables/useMessage'
import type { Chapter } from '@/api/book'

const props = defineProps<{
  open: boolean
  chapters: Chapter[]
  currentInd: number
  loading?: boolean
  bookName?: string
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'select', index: number): void
  (e: 'refresh'): void
}>()

const { success, warning } = useMessage()

// State
const searchKeyword = ref('')
const isReverse = ref(false)
const containerRef = ref<HTMLElement | null>(null)

// Computed
const filteredChapters = computed(() => {
  let list = props.chapters.map((c, i) => ({ ...c, originalIndex: i }))
  
  if (searchKeyword.value) {
    const key = searchKeyword.value.toLowerCase()
    list = list.filter(c => c.title.toLowerCase().includes(key))
  }
  
  if (isReverse.value) {
    list.reverse()
  }
  
  return list
})

// Virtual List
const { list, containerProps, wrapperProps, scrollTo } = useVirtualList(
  filteredChapters,
  {
    itemHeight: 50, // Approx height
    overscan: 10,
  }
)

// Actions
function handleSelect(virtualItem: any) {
  emit('select', virtualItem.data.originalIndex)
  emit('update:open', false)
}

function toggleReverse() {
  isReverse.value = !isReverse.value
}

function scrollToCurrent() {
  if (props.currentInd < 0) return
  
  const targetIndex = filteredChapters.value.findIndex(c => c.originalIndex === props.currentInd)
  if (targetIndex !== -1) {
    scrollTo(targetIndex)
  } else {
    warning('当前章节不在列表中')
  }
}

function handleRefresh() {
  emit('refresh')
}

// Watchers
watch(() => props.open, (val) => {
  if (val) {
    nextTick(() => {
      // Auto scroll to current if visible (and not searching)
      if (!searchKeyword.value) {
        scrollToCurrent()
      }
    })
  }
})
</script>

<template>
  <Sheet :open="open" @update:open="(val) => emit('update:open', val)">
    <SheetContent side="left" class="w-[320px] sm:w-[400px] p-0 flex flex-col gap-0">
      <!-- 头部 -->
      <SheetHeader class="px-4 py-5 border-b bg-muted/30">
        <SheetTitle class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <span class="text-primary text-sm">📚</span>
            </div>
            <div>
              <span class="truncate block text-base font-semibold">{{ bookName || '目录' }}</span>
              <span class="text-xs text-muted-foreground">共 {{ chapters.length }} 章</span>
            </div>
          </div>
          <div class="flex items-center gap-0.5">
             <Button variant="ghost" size="icon" class="h-8 w-8" @click="toggleReverse" title="正序/倒序">
                <ArrowDown v-if="!isReverse" class="h-4 w-4" />
                <ArrowUp v-else class="h-4 w-4" />
             </Button>
             <Button variant="ghost" size="icon" class="h-8 w-8" @click="scrollToCurrent" title="定位当前">
                <Locate class="h-4 w-4" />
             </Button>
             <Button variant="ghost" size="icon" class="h-8 w-8" @click="handleRefresh" :disabled="loading" title="刷新目录">
                <RotateCw class="h-4 w-4" :class="{ 'animate-spin': loading }" />
             </Button>
          </div>
        </SheetTitle>
        <!-- 搜索框 -->
        <div class="relative mt-3">
           <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
           <Input 
             v-model="searchKeyword" 
             placeholder="搜索章节..." 
             class="pl-9 h-9 text-sm bg-background rounded-full border-muted" 
           />
           <button 
             v-if="searchKeyword"
             class="absolute right-3 top-1/2 -translate-y-1/2 hover:bg-muted rounded-full p-1"
             @click="searchKeyword = ''"
           >
             <X class="h-3.5 w-3.5 text-muted-foreground" />
           </button>
        </div>
        <!-- 当前阅读位置 -->
        <div v-if="currentInd >= 0 && !searchKeyword" class="mt-3 px-3 py-2 bg-primary/5 rounded-lg">
          <div class="flex items-center justify-between text-xs">
            <span class="opacity-60">当前阅读</span>
            <span class="text-primary font-medium">{{ Math.round((currentInd + 1) / chapters.length * 100) }}%</span>
          </div>
          <p class="text-sm truncate mt-1 font-medium">{{ chapters[currentInd]?.title }}</p>
        </div>
      </SheetHeader>

      <!-- 加载骨架屏 -->
      <div v-if="loading && chapters.length === 0" class="p-4 space-y-3">
         <SkeletonLoader v-for="i in 10" :key="i" type="text" :lines="1" />
      </div>

      <!-- 章节列表 -->
      <div 
        v-else 
        class="flex-1 overflow-hidden relative"
        v-bind="containerProps"
      >
        <div v-bind="wrapperProps">
          <div 
            v-for="item in list" 
            :key="item.index"
            class="h-[52px] px-4 flex items-center cursor-pointer transition-all relative group"
            :class="[
              item.data.originalIndex === currentInd 
                ? 'bg-primary/10 text-primary' 
                : 'hover:bg-muted/50',
              item.data.originalIndex < currentInd ? 'opacity-60' : ''
            ]"
            @click="handleSelect(item)"
          >
            <!-- 当前章节指示器 -->
            <div 
              v-if="item.data.originalIndex === currentInd"
              class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-r-full"
            />
            <!-- 章节序号 -->
            <span 
              class="w-10 flex-shrink-0 text-right mr-3 text-xs font-mono"
              :class="item.data.originalIndex === currentInd ? 'text-primary' : 'text-muted-foreground'"
            >
              {{ item.data.originalIndex + 1 }}
            </span>
            <!-- 章节标题 -->
            <span 
              class="truncate text-sm flex-1"
              :class="item.data.originalIndex === currentInd ? 'font-semibold' : ''"
            >
              {{ item.data.title }}
            </span>
            <!-- 已读标记 -->
            <span 
              v-if="item.data.originalIndex < currentInd" 
              class="text-xs text-muted-foreground ml-2"
            >
              ✓
            </span>
          </div>
        </div>
        
        <!-- 空状态 -->
        <div v-if="list.length === 0" class="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm">
          <Search class="w-10 h-10 opacity-30 mb-3" />
          未找到相关章节
        </div>
      </div>
      
      <!-- 底部渐变遮罩 -->
      <div class="h-4 bg-gradient-to-t from-background to-transparent -mt-4 relative z-10 pointer-events-none" />
    </SheetContent>
  </Sheet>
</template>
