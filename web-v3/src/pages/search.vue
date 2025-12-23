<script setup lang="ts">
/**
 * 搜索页面 - 优化版
 * 修复：点击搜索结果先保存书籍再跳转
 * 增强：显示书源、取消搜索、实时计数、动画效果
 */
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useStorage } from '@vueuse/core'
import { 
  Search, ArrowLeft, Plus, BookOpen, Clock, X, 
  Loader2, BookMarked, User, Check, Square
} from 'lucide-vue-next'
import { bookApi, type Book } from '@/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useMessage } from '@/composables/useMessage'

const router = useRouter()
const { success, error, warning } = useMessage()

// ====== 状态 ======
const searchKeyword = ref('')
const searchResult = ref<Book[]>([])
const loading = ref(false)
const hasSearched = ref(false)
const addedBooks = ref<Set<string>>(new Set())
const openingBook = ref<string | null>(null) // 正在打开的书籍URL
const progress = ref({ current: 0, total: 0 })

const searchHistory = useStorage<string[]>('search-history', [])

// ====== 计算属性 ======
const resultCount = computed(() => searchResult.value.length)

// ====== 方法 ======

function stopSearch() {
  if (window.searchEventSource) {
    window.searchEventSource.close()
    window.searchEventSource = null
  }
  loading.value = false
}

async function search(keyword?: string) {
  const query = keyword || searchKeyword.value.trim()
  if (!query) {
    warning('请输入搜索关键词')
    return
  }
  
  searchKeyword.value = query
  
  // 关闭已有的SSE连接
  stopSearch()

  if (!searchHistory.value.includes(query)) {
    searchHistory.value = [query, ...searchHistory.value.slice(0, 9)]
  }
  
  loading.value = true
  hasSearched.value = true
  searchResult.value = []

  // 使用 SSE 搜索
  const url = bookApi.getSearchBookSSEUrl(query)

  // Reset progress
  progress.value = { current: 0, total: 0 }

  const es = new EventSource(url)
  window.searchEventSource = es

  es.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data)
      
      // Handle progress events
      if (parsed.type === 'progress') {
        progress.value = { 
          current: parsed.current, 
          total: parsed.total 
        }
        return
      }

      // Check if it's an end event
      if (parsed.type === 'end') {
        es.close()
        loading.value = false
        window.searchEventSource = null
        return
      }
      
      // Handle wrapped data (new format supported by backend)
      if (parsed.data && Array.isArray(parsed.data)) {
        parsed.data.forEach((item: any) => {
          if (item && item.bookUrl) {
            searchResult.value.push(item)
          }
        })
        return
      }

      // Backend returns a single book object as JSON string (Legacy support)
      // Just push it directly to the array
      if (parsed && parsed.bookUrl) {
         searchResult.value.push(parsed)
      }
    } catch (e) {
      console.error('SSE parse error:', e)
    }
  }

  es.addEventListener('end', () => {
    es.close()
    loading.value = false
    window.searchEventSource = null
  })

  es.onerror = () => {
    es.close()
    loading.value = false
    window.searchEventSource = null
  }
}

// 清理
import { onUnmounted } from 'vue'
onUnmounted(() => {
  stopSearch()
})

declare global {
  interface Window {
    searchEventSource: EventSource | null
  }
}

// 添加到书架
async function addToShelf(book: Book) {
  if (addedBooks.value.has(book.bookUrl)) return
  
  try {
    const res = await bookApi.saveBook(book)
    if (res.isSuccess) {
      addedBooks.value.add(book.bookUrl)
      success(`《${book.name}》已添加到书架`)
    } else {
      error(res.errorMsg || '添加失败')
    }
  } catch (e) {
    error('添加失败')
  }
}

// 打开书籍 - 先保存再跳转
async function openBook(book: Book) {
  // 防止重复点击
  if (openingBook.value === book.bookUrl) return
  openingBook.value = book.bookUrl
  
  try {
    // 如果未添加到书架，先自动保存
    if (!addedBooks.value.has(book.bookUrl)) {
      const res = await bookApi.saveBook(book)
      if (!res.isSuccess) {
        error('无法打开书籍，请重试')
        return
      }
      addedBooks.value.add(book.bookUrl)
    }
    // 跳转到阅读页
    router.push({ name: 'reader', query: { url: book.bookUrl } })
  } catch (e) {
    error('打开书籍失败')
  } finally {
    openingBook.value = null
  }
}

function clearHistory() {
  searchHistory.value = []
}

function goBack() {
  router.back()
}

function resetSearch() {
  stopSearch()
  hasSearched.value = false
  searchResult.value = []
  searchKeyword.value = ''
}
</script>

<template>
  <div class="min-h-screen bg-background">
    <!-- 搜索前：居中布局 -->
    <div v-if="!hasSearched && !loading" class="min-h-screen flex flex-col">
      <div class="p-4">
        <Button variant="ghost" size="icon" @click="goBack">
          <ArrowLeft class="h-5 w-5" />
        </Button>
      </div>
      
      <div class="pt-[12vh] flex flex-col items-center px-4">
        <!-- Logo -->
        <div class="mb-8">
          <div class="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Search class="h-8 w-8 text-primary" />
          </div>
        </div>
        
        <div class="w-full max-w-md">
          <div class="relative">
            <Search class="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <input
              v-model="searchKeyword"
              type="text"
              placeholder="输入书名或作者..."
              autofocus
              class="w-full h-12 rounded-full border border-input bg-background pl-12 pr-12 text-base
                     shadow-sm hover:shadow-md focus:shadow-md
                     placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring
                     transition-all"
              @keyup.enter="search()"
            />
            <button
              v-if="searchKeyword"
              class="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-accent"
              @click="searchKeyword = ''"
            >
              <X class="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          
          <div class="flex justify-center mt-6 gap-3">
            <Button @click="search()">
              <Search class="h-4 w-4 mr-2" />
              搜索
            </Button>
          </div>
        </div>
        
        <!-- 搜索历史 -->
        <div v-if="searchHistory.length > 0" class="w-full max-w-md mt-10">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs text-muted-foreground flex items-center gap-1.5">
              <Clock class="h-3.5 w-3.5" />
              最近搜索
            </span>
            <button class="text-xs text-muted-foreground hover:text-foreground transition-colors" @click="clearHistory">
              清空
            </button>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="keyword in searchHistory.slice(0, 8)"
              :key="keyword"
              class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-muted text-sm 
                     hover:bg-accent hover:scale-105 transition-all"
              @click="search(keyword)"
            >
              {{ keyword }}
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 搜索后：结果列表 -->
    <div v-else>
      <header class="sticky top-0 z-50 bg-background/95 backdrop-blur border-b">
        <div class="max-w-2xl mx-auto flex items-center gap-3 px-4 h-14">
          <Button variant="ghost" size="icon" @click="resetSearch">
            <ArrowLeft class="h-5 w-5" />
          </Button>
          
          <div class="flex-1 relative">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              v-model="searchKeyword"
              placeholder="搜索书名、作者..."
              class="pl-10 pr-10 rounded-full"
              @keyup.enter="search()"
            />
            <button
              v-if="searchKeyword"
              class="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-accent"
              @click="searchKeyword = ''"
            >
              <X class="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          
          <!-- 搜索/停止按钮 -->
          <Button v-if="loading" variant="outline" @click="stopSearch">
            <Square class="h-4 w-4 mr-1.5 fill-current" />
            停止
          </Button>
          <Button v-else @click="search()">
            <Search class="h-4 w-4" />
          </Button>
        </div>
      </header>
      
      <main class="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <!-- 实时结果计数 -->
        <div class="flex items-center justify-between mb-6">
          <p class="text-sm text-muted-foreground flex items-center gap-2">
            <!-- 搜索中状态 -->
            <span v-if="loading" class="flex items-center gap-2 text-primary">
              <Loader2 class="h-4 w-4 animate-spin" />
              <span class="font-medium">
                {{ progress.total > 0 ? `正在搜索: ${progress.current}/${progress.total} 个书源` : '正在聚合全网书源...' }}
              </span>
            </span>
            <!-- 搜索完成状态 -->
            <span v-else class="text-foreground font-medium flex items-center gap-2">
              <Check class="h-4 w-4 text-green-500" />
              搜索完成
            </span>
            
            <!-- 结果数量 (仅当有结果时，或者搜索结束时显示) -->
            <Badge v-if="resultCount > 0 || !loading" variant="secondary" class="ml-2 px-2.5 py-0.5 text-xs font-normal transition-all duration-300">
              已找到 {{ resultCount }} 本
            </Badge>
          </p>
        </div>
        
        <!-- 结果网格 -->
        <div v-if="searchResult.length > 0" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 sm:gap-6">
          <div
            v-for="(book, index) in searchResult"
            :key="book.bookUrl + index"
            class="group relative flex flex-col bg-card rounded-xl border border-border/50 hover:border-primary/50 cursor-pointer 
                   transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 animate-in fade-in slide-in-from-bottom-4 overflow-hidden"
            :style="{ animationDelay: `${Math.min(index, 10) * 50}ms` }"
            @click="openBook(book)"
          >
            <div class="flex p-3 gap-4 h-full">
               <!-- 封面 -->
              <div class="relative shrink-0 w-[5rem] sm:w-[5.5rem] aspect-[2/3] rounded shadow-sm overflow-hidden bg-muted group-hover:shadow-md transition-shadow">
                <img
                  v-if="book.coverUrl"
                  :src="`/reader3/cover?path=${encodeURIComponent(book.coverUrl)}`"
                  :alt="book.name"
                  class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  loading="lazy"
                />
                <div v-else class="w-full h-full flex items-center justify-center bg-secondary/30">
                  <BookMarked class="h-8 w-8 text-muted-foreground/30" />
                </div>
                
                <!-- 书源角标 (悬浮更清晰) -->
                <div v-if="book.originName" class="absolute top-0 left-0 bg-black/70 backdrop-blur-[2px] text-white text-[9px] px-1.5 py-0.5 rounded-br font-medium max-w-full truncate">
                  {{ book.originName }}
                </div>
              </div>
              
              <!-- 信息区域 -->
              <div class="flex-1 min-w-0 flex flex-col h-full">
                <!-- 顶部信息 -->
                <div>
                  <h3 class="font-bold text-[15px] leading-tight text-foreground/90 truncate group-hover:text-primary transition-colors mb-1">
                    {{ book.name }}
                  </h3>
                  
                  <div class="flex items-center gap-1.5 text-xs text-muted-foreground/80 mb-2">
                    <User class="h-3 w-3" />
                    <span class="truncate max-w-[8rem]">{{ book.author || '未知作者' }}</span>
                  </div>
                </div>

                <!-- 简介/最新章节 -->
                <div class="flex-1">
                   <p v-if="book.intro" class="text-xs text-muted-foreground/70 line-clamp-2 leading-relaxed h-[2.2rem]">
                    {{ book.intro.trim() }}
                  </p>
                  <p v-else-if="book.latestChapterTitle" class="text-xs text-muted-foreground/70 truncate">
                    最新: {{ book.latestChapterTitle }}
                  </p>
                </div>
                
                <!-- 底部操作 (移除边框，更紧凑) -->
                <div class="mt-2 flex items-end justify-between">
                   <!-- 状态提示 -->
                   <div class="h-6 flex items-center">
                      <Loader2 
                        v-if="openingBook === book.bookUrl" 
                        class="h-4 w-4 animate-spin text-primary" 
                      />
                      <span v-else class="text-[10px] text-primary/80 font-medium opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-[-10px] group-hover:translate-x-0 duration-300">
                        点击阅读 &rarr;
                      </span>
                   </div>
                   
                   <!-- 加书架按钮 -->
                   <Button
                      variant="secondary"
                      size="sm"
                      class="h-7 px-2.5 text-xs font-medium bg-secondary/50 hover:bg-primary hover:text-primary-foreground transition-all rounded-md shadow-sm"
                      :class="addedBooks.has(book.bookUrl) ? 'bg-green-100 text-green-700 hover:bg-green-200 hover:text-green-800' : ''"
                      @click.stop="addToShelf(book)"
                    >
                      <span v-if="addedBooks.has(book.bookUrl)" class="flex items-center gap-1">
                        <Check class="h-3 w-3" /> 已添加
                      </span>
                      <span v-else class="flex items-center gap-1">
                        <Plus class="h-3 w-3" /> 书架
                      </span>
                    </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- 加载骨架屏 -->
        <div v-if="loading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 sm:gap-6">
          <div v-for="i in 8" :key="i" class="flex p-3 gap-3 rounded-xl border bg-card/50">
            <div class="w-[5.5rem] aspect-[2/3] rounded-lg bg-muted animate-pulse" />
            <div class="flex-1 space-y-3 py-1">
              <div class="h-5 bg-muted rounded w-3/4 animate-pulse" />
              <div class="h-3 bg-muted rounded w-1/3 animate-pulse" />
              <div class="space-y-1.5 mt-2">
                 <div class="h-2.5 bg-muted rounded w-full animate-pulse" />
                 <div class="h-2.5 bg-muted rounded w-5/6 animate-pulse" />
              </div>
            </div>
          </div>
        </div>
        
        <!-- 无结果 -->
        <div v-else class="flex flex-col items-center justify-center py-32 animate-in fade-in zoom-in-95 duration-500">
          <div class="w-24 h-24 rounded-full bg-muted/50 flex items-center justify-center mb-6 ring-8 ring-muted/20">
            <BookOpen class="h-10 w-10 text-muted-foreground/40" />
          </div>
          <h3 class="text-xl font-semibold mb-2 text-foreground">未找到相关书籍</h3>
          <p class="text-muted-foreground text-sm mb-8 text-center max-w-sm">
            没有找到与“{{ searchKeyword }}”相关的结果。<br>尝试更换关键词或检查网络连接。
          </p>
          <Button variant="outline" size="lg" @click="resetSearch" class="px-8 rounded-full border-primary/20 hover:bg-primary/5 hover:text-primary transition-colors">
            重新搜索
          </Button>
        </div>
        
        <!-- 加载更多指示 -->
        <div v-if="loading && searchResult.length > 0" class="py-12 text-center">
          <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted/50 text-sm text-muted-foreground">
            <Loader2 class="h-4 w-4 animate-spin" />
            <span>智能聚合搜索中...</span>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 动画 */
.animate-in {
  animation: animateIn 0.3s ease-out forwards;
}

.fade-in {
  opacity: 0;
}

.slide-in-from-bottom-2 {
  transform: translateY(8px);
}

@keyframes animateIn {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
