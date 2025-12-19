<script setup lang="ts">
/**
 * 搜索页面 - shadcn-vue + Google 风格
 */
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useStorage } from '@vueuse/core'
import { 
  Search, ArrowLeft, Plus, BookOpen, Clock, X, 
  Loader2, BookMarked, User, Check
} from 'lucide-vue-next'
import { bookApi, type Book } from '@/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useMessage } from '@/composables/useMessage'

const router = useRouter()
const { success, error, warning, info } = useMessage()

// ====== 状态 ======
const searchKeyword = ref('')
const searchResult = ref<Book[]>([])
const loading = ref(false)
const hasSearched = ref(false)
const addedBooks = ref<Set<string>>(new Set())

const searchHistory = useStorage<string[]>('search-history', [])

// ====== 方法 ======

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
  
  // Close existing SSE
  if (window.searchEventSource) {
    window.searchEventSource.close()
    window.searchEventSource = null
  }

  // Use SSE
  const url = bookApi.getSearchBookSSEUrl(query)
  // Need to handle relative path if client.ts uses proxy but here we construct URL manually?
  // client.ts uses /reader3 base. getSearchBookSSEUrl returns /reader3/... 
  // Should be fine if proxy interprets it or if it matches same origin.
  // In dev `rsbuild` proxy handles `/reader3`.
  
  const es = new EventSource(url)
  window.searchEventSource = es

  es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      // data might be a list or single object?
      // Original code: list.push(data) or list.concat(data)
      // Usually SSE sends one by one or chunks.
      if (Array.isArray(data)) {
        searchResult.value.push(...data)
      } else {
        searchResult.value.push(data)
      }
    } catch (e) {
      // ignore
    }
  }

  es.addEventListener('end', () => {
    es.close()
    loading.value = false
    if (searchResult.value.length === 0) {
      info('未找到相关书籍')
    }
    window.searchEventSource = null
  })

  es.onerror = (e) => {
    es.close()
    loading.value = false
    // error('搜索连接断开') // Optional, might happen normally on end sometimes?
    window.searchEventSource = null
  }
}

// Cleaning up
import { onUnmounted } from 'vue'
onUnmounted(() => {
  if (window.searchEventSource) {
    window.searchEventSource.close()
  }
})

declare global {
  interface Window {
    searchEventSource: EventSource | null
  }
}

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

function openBook(book: Book) {
  router.push({ name: 'reader', query: { url: book.bookUrl } })
}

function clearHistory() {
  searchHistory.value = []
}

function removeHistory(keyword: string) {
  searchHistory.value = searchHistory.value.filter(k => k !== keyword)
}

function goBack() {
  router.back()
}

function resetSearch() {
  hasSearched.value = false
  searchResult.value = []
  searchKeyword.value = ''
}
</script>

<template>
  <div class="min-h-screen bg-background">
    <!-- 搜索前：居中 -->
    <div v-if="!hasSearched && !loading" class="min-h-screen flex flex-col">
      <div class="p-4">
        <Button variant="ghost" size="icon" @click="goBack">
          <ArrowLeft class="h-5 w-5" />
        </Button>
      </div>
      
      <div class="pt-[15vh] flex flex-col items-center px-4">
        
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
                     transition-shadow"
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
            <Button variant="secondary" @click="search()">搜索</Button>
          </div>
        </div>
        
        <div v-if="searchHistory.length > 0" class="w-full max-w-md mt-8">
          <div class="flex items-center justify-between mb-3">
            <span class="text-xs text-muted-foreground flex items-center gap-1">
              <Clock class="h-3 w-3" />
              最近搜索
            </span>
            <button class="text-xs text-muted-foreground hover:text-foreground" @click="clearHistory">
              清空
            </button>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="keyword in searchHistory.slice(0, 6)"
              :key="keyword"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-sm hover:bg-accent transition-colors"
              @click="search(keyword)"
            >
              {{ keyword }}
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 搜索后：顶部栏 + 结果 -->
    <div v-else>
      <header class="sticky top-0 z-50 bg-background border-b">
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
          
          <Button :disabled="loading" @click="search()">
            <Loader2 v-if="loading" class="h-4 w-4 animate-spin" />
            <span v-else>搜索</span>
          </Button>
        </div>
      </header>
      
      <main class="max-w-2xl mx-auto px-4 py-4">
        <!-- 加载 -->
        <div v-if="loading" class="space-y-4">
          <div v-for="i in 5" :key="i" class="flex gap-4 p-4 rounded-lg animate-pulse">
            <div class="w-14 h-20 rounded-lg bg-muted" />
            <div class="flex-1 space-y-2 py-1">
              <div class="h-4 bg-muted rounded w-3/4" />
              <div class="h-3 bg-muted rounded w-1/2" />
              <div class="h-3 bg-muted rounded w-full" />
            </div>
          </div>
        </div>
        
        <!-- 结果 -->
        <template v-else>
          <p class="text-sm text-muted-foreground mb-4">
            找到 {{ searchResult.length }} 本书籍
          </p>
          
          <div v-if="searchResult.length > 0" class="space-y-2">
            <div
              v-for="book in searchResult"
              :key="book.bookUrl"
              class="flex gap-4 p-3 rounded-lg hover:bg-accent/50 cursor-pointer transition-colors"
              @click="openBook(book)"
            >
              <div class="flex-shrink-0 w-14 h-20 rounded-lg overflow-hidden bg-muted">
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
              
              <div class="flex-1 min-w-0 py-0.5">
                <h3 class="font-medium text-sm truncate">{{ book.name }}</h3>
                <p class="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <User class="h-3 w-3" />
                  {{ book.author || '未知作者' }}
                </p>
                <p class="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                  {{ book.intro || '暂无简介' }}
                </p>
              </div>
              
              <Button
                variant="ghost"
                size="icon"
                :class="addedBooks.has(book.bookUrl) ? 'text-green-600' : ''"
                @click.stop="addToShelf(book)"
              >
                <Check v-if="addedBooks.has(book.bookUrl)" class="h-4 w-4" />
                <Plus v-else class="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          <div v-else class="flex flex-col items-center justify-center py-20">
            <BookOpen class="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p class="text-muted-foreground text-sm">未找到相关书籍</p>
          </div>
        </template>
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
</style>
