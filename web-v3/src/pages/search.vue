<script setup lang="ts">
/**
 * 搜索页面 - 优化版
 * 修复：点击搜索结果先保存书籍再跳转
 * 增强：显示书源、取消搜索、实时计数、动画效果
 */
import { ref, computed, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useStorage } from '@vueuse/core'
import { 
  Search, ArrowLeft, X, 
  Loader2, BookMarked, Check
} from 'lucide-vue-next'
import { bookApi, type Book } from '@/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import LazyImage from '@/components/ui/LazyImage.vue'
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
  <div class="min-h-screen bg-background text-foreground selection:bg-primary/20 pb-10">
    <div class="h-safe-top" />
    
    <!-- 顶部导航栏 (Unified Header) -->
    <!-- 仅在非Hero状态(即有搜索结果)或移动端显示 -->
    <header 
      v-if="hasSearched || searchResult.length > 0" 
      class="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border/40 transition-all duration-300"
    >
      <div class="px-4 sm:px-6 h-16 flex items-center justify-between max-w-7xl mx-auto gap-4">
        
        <!-- 左侧：返回/品牌 -->
        <div class="flex items-center gap-3 shrink-0">
           <Button variant="ghost" size="icon" @click="resetSearch" class="rounded-full hover:bg-muted -ml-2">
             <ArrowLeft class="h-5 w-5 text-muted-foreground" />
           </Button>
           <div class="hidden sm:flex items-center gap-2.5">
              <span class="font-semibold text-lg tracking-tight">发现</span>
           </div>
        </div>

        <!-- 中间：搜索框 (Compact) -->
        <div class="flex-1 max-w-xl relative group">
           <div class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
             <Search class="h-4 w-4 text-muted-foreground/50 group-focus-within:text-primary transition-colors" />
           </div>
           <input
             v-model="searchKeyword"
             class="w-full h-10 rounded-full bg-secondary/50 border-0 pl-10 pr-10 focus:ring-0 focus:bg-secondary transition-all outline-none text-sm placeholder:text-muted-foreground/50"
             placeholder="搜索书名或作者..."
             @keyup.enter="search()"
           />
           <button v-if="searchKeyword" class="absolute inset-y-0 right-0 pr-3 flex items-center" @click="searchKeyword = ''">
              <X class="h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors" />
           </button>
        </div>

        <!-- 右侧：操作 -->
        <div class="flex items-center gap-2 shrink-0">
           <Button v-if="loading" variant="destructive" size="sm" @click="stopSearch" class="rounded-full px-4 h-8 text-xs font-medium">
              停止
           </Button>
           <Button v-else @click="search()" size="sm" class="rounded-full px-5 h-8 font-medium bg-foreground text-background hover:bg-foreground/90 shadow-none">
              搜索
           </Button>
        </div>
      </div>
    </header>

    <!-- 搜索前：Hero 状态 (Zero State) - Minimalist -->
    <div v-if="!hasSearched && !loading && searchResult.length === 0" class="min-h-[85vh] flex flex-col items-center justify-center px-6 animate-in fade-in zoom-in-95 duration-500">
      
      <div class="z-10 w-full max-w-lg flex flex-col items-center">
        <h2 class="text-3xl sm:text-4xl font-bold tracking-tight mb-3 text-center text-foreground">
          探索
        </h2>
        <p class="text-muted-foreground text-center mb-10 max-w-md text-sm sm:text-base leading-relaxed">
          全网优质书源，一键直达
        </p>
        
        <!-- 极简搜索框 -->
        <div class="w-full relative group">
          <div class="relative flex items-center bg-background border border-input shadow-sm hover:shadow-md transition-all duration-300 rounded-full h-12 sm:h-14 px-5 group-focus-within:ring-2 group-focus-within:ring-primary/20 group-focus-within:border-primary/50">
            <Search class="h-5 w-5 text-muted-foreground/50 mr-3 shrink-0" />
            <input
              v-model="searchKeyword"
              type="text"
              placeholder="书名 / 作者"
              class="flex-1 bg-transparent border-0 outline-none text-base sm:text-lg placeholder:text-muted-foreground/30 h-full w-full"
              @keyup.enter="search()"
              autofocus
            />
            <div v-if="searchKeyword" class="mr-2">
                <button class="p-1 rounded-full hover:bg-muted text-muted-foreground transition-colors" @click="searchKeyword = ''">
                    <X class="h-4 w-4" />
                </button>
            </div>
            <div class="h-5 w-px bg-border/50 mx-2 shrink-0" />
            <button @click="search()" class="text-sm font-medium hover:text-primary transition-colors px-2">
               搜索
            </button>
          </div>
        </div>

        <!-- 搜索历史 -->
        <div v-if="searchHistory.length > 0" class="w-full mt-10 animate-in slide-in-from-bottom-4 duration-500 delay-100">
          <div class="flex items-center justify-between mb-3 px-1">
            <span class="text-xs font-semibold text-muted-foreground/40 uppercase tracking-widest">
              Recent
            </span>
            <button class="text-xs text-muted-foreground/60 hover:text-destructive transition-colors px-2 py-1" @click="clearHistory">
              清除
            </button>
          </div>
          <div class="flex flex-wrap gap-2 justify-center sm:justify-start">
            <button
              v-for="keyword in searchHistory.slice(0, 8)"
              :key="keyword"
              class="px-3 py-1.5 rounded-full bg-secondary/40 hover:bg-secondary text-sm text-foreground/80 hover:text-foreground transition-colors"
              @click="search(keyword)"
            >
              {{ keyword }}
            </button>
          </div>
        </div>
        
        <div class="mt-12">
           <Button variant="link" class="text-muted-foreground hover:text-foreground" @click="goBack">
             返回书架
           </Button>
        </div>
      </div>
    </div>
    
    <!-- 搜索结果区域 -->
    <main v-else class="max-w-7xl mx-auto px-4 sm:px-6 pt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
         <!-- 状态栏 -->
         <div class="flex items-center justify-between mb-6 px-1">
            <div class="flex items-center gap-3">
               <span class="text-sm font-semibold text-foreground">搜索结果</span>
               <span class="text-xs text-muted-foreground" v-if="loading">
                  <Loader2 class="inline h-3 w-3 animate-spin mr-1" />
                  搜索中...
               </span>
               <span class="text-xs text-muted-foreground" v-else-if="resultCount > 0">
                  {{ resultCount }} 本
               </span>
            </div>
         </div>
         
         <!-- 结果网格 (Clean & Flat) -->
         <div v-if="searchResult.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-20">
            <div
               v-for="(book, index) in searchResult"
               :key="book.bookUrl + index"
               class="group relative flex bg-card rounded-lg border border-border/40 hover:border-border/80 cursor-pointer 
                      overflow-hidden transition-all duration-200 ease-out
                      hover:shadow-sm hover:bg-muted/30"
               @click="openBook(book)"
            >
               <!-- 封面 (左侧) -->
               <div class="relative w-24 sm:w-24 shrink-0 bg-muted">
                   <LazyImage
                     v-if="book.coverUrl"
                     :src="`/reader3/cover?path=${encodeURIComponent(book.coverUrl)}`"
                     class="w-full h-full object-cover"
                   />
                   <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground/20 bg-secondary">
                      <BookMarked class="h-8 w-8" />
                   </div>
               </div>
               
               <!-- 信息 (右侧) -->
               <div class="flex-1 p-3 flex flex-col min-w-0">
                   <div class="flex justify-between items-start gap-2">
                      <h3 class="font-medium text-sm text-foreground line-clamp-2 leading-snug group-hover:text-primary transition-colors">
                         {{ book.name }}
                      </h3>
                   </div>
                   
                   <div class="flex items-center gap-1.5 mt-1 mb-2">
                      <span class="text-xs text-muted-foreground truncate">{{ book.author || '未知作者' }}</span>
                      <span class="text-xs text-muted-foreground/30">•</span>
                      <span class="text-[10px] text-muted-foreground/70 truncate max-w-[6rem]">{{ book.originName }}</span>
                   </div>
                   
                   <!-- 简介/最新章节 -->
                   <div class="flex-1 relative">
                      <p v-if="book.intro" class="text-xs text-muted-foreground/60 line-clamp-2 leading-relaxed h-[2rem]">
                         {{ book.intro.trim() }}
                      </p>
                      <p v-else-if="book.latestChapterTitle" class="text-[10px] text-muted-foreground/50 truncate">
                         {{ book.latestChapterTitle }}
                      </p>
                   </div>
                   
                   <!-- 底部操作 -->
                   <div class="mt-2 flex items-center justify-end">
                       <Button
                         size="sm"
                         variant="ghost"
                         class="h-7 px-3 text-xs rounded-md hover:bg-secondary"
                         :class="addedBooks.has(book.bookUrl) ? 'text-green-600' : 'text-muted-foreground'"
                         @click.stop="addToShelf(book)"
                       >
                          <Check v-if="addedBooks.has(book.bookUrl)" class="h-3 w-3 mr-1" />
                          <span v-else class="mr-1 text-[10px]">+</span>
                          {{ addedBooks.has(book.bookUrl) ? '已添加' : '收藏' }}
                       </Button>
                   </div>
               </div>
               
               <!-- Loading Overlay -->
               <div v-if="openingBook === book.bookUrl" class="absolute inset-0 bg-background/80 backdrop-blur-sm z-30 flex items-center justify-center">
                   <Loader2 class="h-5 w-5 animate-spin text-primary" />
               </div>
            </div>
         </div>
         
         <!-- 加载骨架 -->
         <div v-if="loading" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-4 pb-20">
           <div v-for="i in 8" :key="i" class="flex h-32 rounded-lg border border-border/30 bg-card p-0 overflow-hidden">
             <div class="w-24 bg-muted animate-pulse" />
             <div class="flex-1 p-3 space-y-2">
                <div class="h-4 w-3/4 bg-muted animate-pulse rounded" />
                <div class="h-3 w-1/2 bg-muted animate-pulse rounded" />
                <div class="h-10 w-full bg-muted animate-pulse rounded mt-2 opacity-50" />
             </div>
           </div>
         </div>
    </main>
  </div>
</template>

<style scoped>
.h-safe-top {
  height: env(safe-area-inset-top, 0px);
}
.scrollbar-hide {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
</style>
