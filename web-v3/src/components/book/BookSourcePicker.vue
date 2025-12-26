<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useMessage } from '@/composables/useMessage'
import { logger } from '@/utils/logger'
import { Check, RefreshCw, Loader2, Globe } from 'lucide-vue-next'
import { 
  Sheet,
  SheetContent,
} from '@/components/ui/sheet'
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

// 按响应时间排序 (当前源优先，然后按时间升序)
const sortedSources = computed(() => {
  return [...sources.value].sort((a, b) => {
    // 当前书源始终排第一
    if (a.bookUrl === currentBook.value?.bookUrl) return -1
    if (b.bookUrl === currentBook.value?.bookUrl) return 1
    // 按响应时间排序 (time 越小越快)
    const timeA = a.time ?? Infinity
    const timeB = b.time ?? Infinity
    return timeA - timeB
  })
})

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
      logger.error('加载书源失败', err as Error, { function: 'BookSourcePicker' })
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
      
      await readerStore.openBook(newBook, true) // refresh=true 强制刷新目录
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
    <!-- 大屏居中，小屏全宽 -->
    <SheetContent 
      side="bottom" 
      class="h-[75vh] md:h-[70vh] md:max-w-2xl md:mx-auto md:rounded-t-3xl flex flex-col p-0 rounded-t-2xl"
    >
      <!-- 顶部拖拽条 -->
      <div class="flex justify-center py-3">
        <div class="w-10 h-1 rounded-full bg-muted-foreground/20" />
      </div>
      
      <!-- 书籍信息头部 -->
      <div class="px-5 pb-4">
        <div class="flex items-start gap-4">
          <!-- 封面缩略图 -->
          <div class="w-12 h-16 rounded-lg bg-muted flex-shrink-0 overflow-hidden shadow-sm">
            <img 
              v-if="currentBook?.coverUrl" 
              :src="`/reader3/cover?path=${encodeURIComponent(currentBook.coverUrl)}`"
              class="w-full h-full object-cover"
            />
            <div v-else class="w-full h-full flex items-center justify-center">
              <Globe class="h-5 w-5 text-muted-foreground/50" />
            </div>
          </div>
          
          <!-- 书籍信息 -->
          <div class="flex-1 min-w-0">
            <h2 class="font-semibold text-base truncate">{{ currentBook?.name }}</h2>
            <p class="text-sm text-muted-foreground truncate mt-0.5">{{ currentBook?.author || '未知作者' }}</p>
            <p class="text-xs text-muted-foreground/70 mt-1">
              当前: {{ currentBook?.originName || '未知源' }}
            </p>
          </div>
        </div>
      </div>
      
      <!-- 操作栏 -->
      <div class="px-5 pb-3 flex items-center justify-between">
        <div class="flex items-center gap-1.5">
          <span class="text-sm font-medium">可用书源</span>
          <span class="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
            {{ sources.length }}
          </span>
          <span class="text-[10px] text-muted-foreground/60 ml-1">按速度排序</span>
        </div>
        <div class="flex gap-2">
          <button 
            class="h-8 px-3 text-xs rounded-full border bg-background hover:bg-muted transition-colors flex items-center gap-1.5"
            :disabled="loading || loadingMore" 
            @click="refresh"
          >
            <RefreshCw class="h-3.5 w-3.5" :class="{ 'animate-spin': loading }" />
            刷新
          </button>
          <button 
            class="h-8 px-3 text-xs rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1.5"
            :disabled="loading || loadingMore"
            @click="startSearchSSE"
          >
            <Loader2 v-if="loadingMore" class="h-3.5 w-3.5 animate-spin" />
            <Globe v-else class="h-3.5 w-3.5" />
            {{ loadingMore ? '搜索中' : '搜索更多' }}
          </button>
        </div>
      </div>

      <!-- 分隔线 -->
      <div class="border-t" />

      <!-- 书源列表 -->
      <div class="flex-1 overflow-y-auto">
        <!-- 空状态 -->
        <div v-if="sources.length === 0 && !loading && !loadingMore" class="flex flex-col items-center justify-center h-full text-muted-foreground">
          <Globe class="h-12 w-12 opacity-30 mb-4" />
          <p class="text-sm">暂无可用书源</p>
          <p class="text-xs mt-1 opacity-60">点击"搜索更多"查找其他书源</p>
        </div>

        <!-- 加载骨架 -->
        <div v-else-if="loading && sources.length === 0" class="px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div v-for="i in 6" :key="i" class="h-16 rounded-xl bg-muted animate-pulse" />
        </div>

        <!-- 书源卡片列表 - 大屏双列 -->
        <div v-else class="px-4 py-3 grid grid-cols-1 md:grid-cols-2 gap-2">
          <button
            v-for="source in sortedSources"
            :key="source.bookUrl"
            class="w-full p-3 rounded-xl text-left transition-all active:scale-[0.98]"
            :class="[
              source.bookUrl === currentBook?.bookUrl 
                ? 'bg-primary/10 ring-2 ring-primary/30' 
                : 'bg-muted/50 hover:bg-muted'
            ]"
            @click="changeSource(source)"
          >
            <div class="flex items-start gap-3">
              <!-- 状态指示 -->
              <div 
                class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                :class="source.bookUrl === currentBook?.bookUrl ? 'bg-primary text-primary-foreground' : 'bg-background'"
              >
                <Check v-if="source.bookUrl === currentBook?.bookUrl" class="h-4 w-4" />
                <Globe v-else class="h-4 w-4 text-muted-foreground" />
              </div>
              
              <!-- 书源信息 -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="font-medium text-sm truncate">
                    {{ source.originName || source.origin }}
                  </span>
                  <span v-if="source.time" class="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                    {{ formatTime(source.time) }}
                  </span>
                </div>
                <p class="text-xs text-muted-foreground truncate mt-1">
                  {{ source.latestChapterTitle || '暂无章节信息' }}
                </p>
              </div>
            </div>
          </button>
        </div>
        
        <!-- 搜索中指示器 -->
        <div v-if="loadingMore" class="py-6 text-center">
          <Loader2 class="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
          <p class="text-xs text-muted-foreground mt-2">正在搜索更多书源...</p>
        </div>
      </div>
    </SheetContent>
  </Sheet>
</template>
