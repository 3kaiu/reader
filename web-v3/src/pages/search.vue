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
  Loader2, BookMarked, User, Check, Globe, Square
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
  
  if (!searchHistory.value.includes(query)) {
    searchHistory.value = [query, ...searchHistory.value.slice(0, 9)]
  }
  
  loading.value = true
  hasSearched.value = true
  searchResult.value = []
  
  // 关闭已有的SSE连接
  stopSearch()

  // 使用 SSE 搜索
  const url = bookApi.getSearchBookSSEUrl(query)
  const es = new EventSource(url)
  window.searchEventSource = es

  es.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data)
      // SSE 返回格式: {"lastIndex": number, "data": [...书籍列表...]}
      const books = parsed.data
      if (Array.isArray(books) && books.length > 0) {
        searchResult.value.push(...books)
      }
    } catch (e) {
      // ignore parse errors
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
      
      <main class="max-w-2xl mx-auto px-4 py-4">
        <!-- 实时结果计数 -->
        <div class="flex items-center justify-between mb-4">
          <p class="text-sm text-muted-foreground flex items-center gap-2">
            <span v-if="loading" class="flex items-center gap-1.5">
              <Loader2 class="h-3.5 w-3.5 animate-spin" />
              搜索中...
            </span>
            <span v-else>搜索完成</span>
            <Badge variant="secondary" class="ml-1">
              {{ resultCount }} 本
            </Badge>
          </p>
        </div>
        
        <!-- 加载中同时显示已有结果 -->
        <div v-if="searchResult.length > 0" class="space-y-2">
          <div
            v-for="(book, index) in searchResult"
            :key="book.bookUrl + index"
            class="flex gap-4 p-3 rounded-xl border bg-card hover:bg-accent/50 cursor-pointer 
                   transition-all duration-200 hover:shadow-sm group animate-in fade-in slide-in-from-bottom-2"
            :style="{ animationDelay: `${Math.min(index, 10) * 30}ms` }"
            @click="openBook(book)"
          >
            <!-- 封面 -->
            <div class="flex-shrink-0 w-14 h-20 rounded-lg overflow-hidden bg-muted shadow-sm">
              <img
                v-if="book.coverUrl"
                :src="`/reader3/cover?path=${encodeURIComponent(book.coverUrl)}`"
                :alt="book.name"
                class="w-full h-full object-cover"
              />
              <div v-else class="w-full h-full flex items-center justify-center">
                <BookMarked class="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
            
            <!-- 信息 -->
            <div class="flex-1 min-w-0 py-0.5">
              <div class="flex items-start gap-2">
                <h3 class="font-medium text-sm truncate flex-1">{{ book.name }}</h3>
                <!-- 打开中状态 -->
                <Loader2 
                  v-if="openingBook === book.bookUrl" 
                  class="h-4 w-4 animate-spin text-primary shrink-0" 
                />
              </div>
              
              <div class="flex items-center gap-2 mt-1 flex-wrap">
                <span class="text-xs text-muted-foreground flex items-center gap-1">
                  <User class="h-3 w-3" />
                  {{ book.author || '未知作者' }}
                </span>
                <!-- 书源标签 -->
                <Badge v-if="book.originName" variant="outline" class="text-[10px] h-4 px-1.5">
                  <Globe class="h-2.5 w-2.5 mr-0.5" />
                  {{ book.originName }}
                </Badge>
              </div>
              
              <p v-if="book.intro" class="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                {{ book.intro }}
              </p>
              <p v-else-if="book.latestChapterTitle" class="text-xs text-muted-foreground mt-1.5 truncate">
                最新: {{ book.latestChapterTitle }}
              </p>
            </div>
            
            <!-- 添加按钮 -->
            <Button
              variant="ghost"
              size="icon"
              class="shrink-0 self-center opacity-0 group-hover:opacity-100 transition-opacity"
              :class="addedBooks.has(book.bookUrl) ? 'text-green-600 opacity-100' : ''"
              @click.stop="addToShelf(book)"
            >
              <Check v-if="addedBooks.has(book.bookUrl)" class="h-4 w-4" />
              <Plus v-else class="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        <!-- 加载骨架屏 (仅在无结果时显示) -->
        <div v-else-if="loading" class="space-y-3">
          <div v-for="i in 6" :key="i" class="flex gap-4 p-3 rounded-xl border animate-pulse">
            <div class="w-14 h-20 rounded-lg bg-muted" />
            <div class="flex-1 space-y-2 py-1">
              <div class="h-4 bg-muted rounded w-3/4" />
              <div class="h-3 bg-muted rounded w-1/2" />
              <div class="h-3 bg-muted rounded w-full" />
            </div>
          </div>
        </div>
        
        <!-- 无结果 -->
        <div v-else-if="!loading && searchResult.length === 0" class="flex flex-col items-center justify-center py-20">
          <div class="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6">
            <BookOpen class="h-10 w-10 text-muted-foreground/50" />
          </div>
          <h3 class="text-lg font-medium mb-2">未找到相关书籍</h3>
          <p class="text-muted-foreground text-sm mb-6">换个关键词试试？</p>
          <Button variant="outline" @click="resetSearch">
            重新搜索
          </Button>
        </div>
        
        <!-- 加载更多指示 -->
        <div v-if="loading && searchResult.length > 0" class="py-6 text-center">
          <Loader2 class="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
          <p class="text-xs text-muted-foreground mt-2">继续搜索中...</p>
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
