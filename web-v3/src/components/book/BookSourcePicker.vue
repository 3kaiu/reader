<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useMessage } from 'naive-ui'
import { Check, RefreshCw, Loader2, Globe } from 'lucide-vue-next'
import { 
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { sourceApi, type BookSource } from '@/api/source'
import { useReaderStore } from '@/stores/reader'

const props = withDefaults(defineProps<{
  open?: boolean
}>(), {
  open: false
})

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const message = useMessage()
const readerStore = useReaderStore()

// 状态
const loading = ref(false)
const loadingMore = ref(false)
const sources = ref<BookSource[]>([])
const searchEventSource = ref<EventSource | null>(null)

// 当前书籍
const currentBook = computed(() => readerStore.currentBook)

// 初始化
watch(() => props.open, (val) => {
  if (val && sources.value.length === 0) {
    refresh()
  }
})

onUnmounted(() => {
  closeEventSource()
})

// === 方法 ===

function closeEventSource() {
  if (searchEventSource.value) {
    searchEventSource.value.close()
    searchEventSource.value = null
  }
}

async function refresh() {
  if (!currentBook.value?.bookUrl) return
  
  loading.value = true
  try {
    const res = await sourceApi.getAvailableBookSource(currentBook.value.bookUrl, true)
    if (res.isSuccess) {
      sources.value = res.data || []
      // 自动开始搜索更多
      if (sources.value.length === 0) {
        startSearchSSE()
      }
    } else {
      message.error(res.errorMsg || '获取书源失败')
    }
  } catch (err) {
    message.error('获取书源失败')
  } finally {
    loading.value = false
  }
}

// SSE 流式搜索
function startSearchSSE() {
  if (!currentBook.value?.bookUrl || loadingMore.value) return
  
  closeEventSource()
  loadingMore.value = true
  
  // 构建 SSE URL
  const baseUrl = import.meta.env.VITE_API_URL || '/reader3'
  const ssePath = sourceApi.getSearchBookSourceSSEUrl({
    url: currentBook.value.bookUrl,
    concurrentCount: 20 // 默认并发数
  })
  
  const fullUrl = `${baseUrl}${ssePath}`

  searchEventSource.value = new EventSource(fullUrl, { withCredentials: true })
  
  const es = searchEventSource.value
  
  es.addEventListener('message', (e) => {
    try {
      const res = JSON.parse(e.data)
      if (res.data) {
        // 去重添加
        const newSources = (res.data as BookSource[]).filter(
          ns => !sources.value.some(s => s.bookUrl === ns.bookUrl)
        )
        sources.value.push(...newSources)
      }
    } catch (err) {
      console.error(err)
    }
  })
  
  es.addEventListener('end', () => {
    loadingMore.value = false
    closeEventSource()
  })
  
  es.addEventListener('error', () => {
    loadingMore.value = false
    closeEventSource()
  })
}

// 切换书源
async function changeSource(source: BookSource) {
  if (!currentBook.value?.bookUrl) return
  if (source.bookUrl === currentBook.value.bookUrl) return
  
  loading.value = true
  try {
    const res = await sourceApi.setBookSource(
      currentBook.value.bookUrl,
      source.bookUrl,
      source.origin
    )
    
    if (res.isSuccess) {
      message.success('换源成功')
      // 更新当前书籍信息
      const newBook = { 
        ...currentBook.value,
        bookUrl: source.bookUrl,
        origin: source.origin,
        originName: source.originName
      }
      
      if (source.type !== undefined) newBook.type = source.type
      if (source.coverUrl) newBook.coverUrl = source.coverUrl
      
      await readerStore.openBook(newBook)
      emit('update:open', false)
    } else {
      message.error(res.errorMsg || '换源失败')
    }
  } catch (err) {
    message.error('换源出错')
  } finally {
    loading.value = false
  }
}

// 辅助函数
function formatTime(ms?: number) {
  if (!ms) return ''
  if (ms < 1000) return `${ms}ms`
  return `${(ms/1000).toFixed(1)}s`
}
</script>

<template>
  <Sheet :open="open" @update:open="emit('update:open', $event)">
    <SheetContent side="bottom" class="h-[80vh] flex flex-col p-0 rounded-t-xl">
      <SheetHeader class="px-6 py-4 border-b flex-shrink-0">
        <div class="flex items-center justify-between">
          <SheetTitle class="flex items-center gap-2">
            <Globe class="h-5 w-5" />
            换源 ({{ sources.length }})
          </SheetTitle>
          <div class="flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              :disabled="loading || loadingMore" 
              @click="refresh"
            >
              <RefreshCw class="h-4 w-4 mr-1" :class="{ 'animate-spin': loading }" />
              刷新
            </Button>
            <Button 
              size="sm"
              :disabled="loading || loadingMore"
              @click="startSearchSSE"
            >
              <Loader2 v-if="loadingMore" class="h-4 w-4 mr-1 animate-spin" />
              {{ loadingMore ? '搜索中...' : '搜索更多' }}
            </Button>
          </div>
        </div>
      </SheetHeader>

      <div class="flex-1 overflow-y-auto px-6 py-2">
        <div v-if="sources.length === 0 && !loading" class="text-center py-10 text-muted-foreground">
          暂无可用书源，请尝试"搜索更多"
        </div>

        <div class="space-y-2">
          <div
            v-for="source in sources"
            :key="source.bookUrl"
            class="flex flex-col gap-1 p-3 rounded-lg border cursor-pointer transition-all hover:bg-accent"
            :class="source.bookUrl === currentBook?.bookUrl ? 'border-primary bg-primary/5' : 'border-border'"
            @click="changeSource(source)"
          >
            <div class="flex items-center justify-between">
              <span class="font-medium truncate flex-1 flex items-center gap-2">
                {{ source.originName || source.origin }}
                <span v-if="source.type" class="text-xs px-1.5 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                  {{ source.type === 1 ? '文本' : '音频' }}
                </span>
              </span>
              <span class="text-xs text-muted-foreground shrink-0 flex items-center gap-2">
                {{ formatTime(source.time) }}
                <Check v-if="source.bookUrl === currentBook?.bookUrl" class="h-4 w-4 text-primary" />
              </span>
            </div>
            
            <div class="text-sm text-muted-foreground truncate">
              {{ source.latestChapterTitle || '无最新章节' }}
            </div>
            
            <div class="text-xs text-muted-foreground/60 truncate" v-if="source.author">
               作者: {{ source.author }}
            </div>
          </div>
        </div>
      </div>
    </SheetContent>
  </Sheet>
</template>
