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
    <SheetContent side="left" class="w-[320px] sm:w-[380px] p-0 flex flex-col gap-0">
      <SheetHeader class="px-4 py-4 border-b">
        <SheetTitle class="flex items-center justify-between">
          <span class="truncate pr-2">{{ bookName || '目录' }}</span>
          <div class="flex items-center gap-1">
             <Button variant="ghost" size="icon" @click="toggleReverse" title="正序/倒序">
                <ArrowDown v-if="!isReverse" class="h-4 w-4" />
                <ArrowUp v-else class="h-4 w-4" />
             </Button>
             <Button variant="ghost" size="icon" @click="scrollToCurrent" title="定位当前">
                <Locate class="h-4 w-4" />
             </Button>
             <Button variant="ghost" size="icon" @click="handleRefresh" :disabled="loading" title="刷新目录">
                <RotateCw class="h-4 w-4" :class="{ 'animate-spin': loading }" />
             </Button>
          </div>
        </SheetTitle>
        <div class="relative mt-2">
           <Search class="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
           <Input 
             v-model="searchKeyword" 
             placeholder="搜索章节..." 
             class="pl-8 h-8 text-sm" 
           />
           <button 
             v-if="searchKeyword"
             class="absolute right-2 top-1/2 -translate-y-1/2 hover:bg-muted rounded-full p-0.5"
             @click="searchKeyword = ''"
           >
             <X class="h-3 w-3 text-muted-foreground" />
           </button>
        </div>
      </SheetHeader>

      <div v-if="loading && chapters.length === 0" class="p-4 space-y-3">
         <SkeletonLoader v-for="i in 10" :key="i" type="text" :lines="1" />
      </div>

      <div 
        v-else 
        class="flex-1 overflow-hidden relative"
        ref="containerRef"
        v-bind="containerProps"
      >
        <div v-bind="wrapperProps">
          <div 
            v-for="item in list" 
            :key="item.index"
            class="h-[50px] px-4 flex items-center cursor-pointer hover:bg-muted/50 transition-colors border-b border-border/40"
            :class="{ 
              'text-primary font-medium bg-muted/30': item.data.originalIndex === currentInd
            }"
            @click="handleSelect(item)"
          >
             <span class="text-xs text-muted-foreground w-10 flex-shrink-0 text-right mr-3 font-mono">
               {{ item.data.originalIndex + 1 }}
             </span>
             <span class="truncate text-sm">{{ item.data.title }}</span>
          </div>
        </div>
        
        <div v-if="list.length === 0" class="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm">
           未找到相关章节
        </div>
      </div>
      
      <div class="p-2 border-t text-center text-xs text-muted-foreground">
        共 {{ chapters.length }} 章
      </div>
    </SheetContent>
  </Sheet>
</template>
