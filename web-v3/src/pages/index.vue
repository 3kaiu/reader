<script setup lang="ts">
/**
 * 首页/书架 - shadcn-vue
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useDark, useToggle, useStorage } from '@vueuse/core'
import { 
  Search, Plus, Settings, Moon, Sun, RefreshCw, 
  BookOpen, Library, Database, Folder, Regex,
  CheckSquare, Trash2, X, Brain
} from 'lucide-vue-next'
import { bookApi, type Book, manageApi } from '@/api'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import BookCard from '@/components/book/BookCard.vue'
import { SkeletonLoader } from '@/components/ui'
import { useMessage } from '@/composables/useMessage'

const router = useRouter()
const { success, error, warning } = useMessage()

// 暗色模式
const isDark = useDark()
const toggleDark = useToggle(isDark)

// ====== 状态 ======
const books = ref<Book[]>([])
const loading = ref(true)
const refreshing = ref(false)
const searchKeyword = ref('')
const showSidebar = ref(false)
const showProgress = useStorage('bookshelf-progress', true)

// ====== 计算属性 ======
const isManageMode = ref(false)
const selectedBooks = ref<Set<string>>(new Set())

// ====== 计算属性 ======

// 按书名+作者去重，保留最近阅读的版本
const deduplicatedBooks = computed(() => {
  const bookMap = new Map<string, { book: Book; sourceCount: number }>()
  
  for (const book of books.value) {
    // 使用 书名+作者 作为唯一标识
    const key = `${book.name}||${book.author || ''}`
    const existing = bookMap.get(key)
    
    if (!existing) {
      bookMap.set(key, { book, sourceCount: 1 })
    } else {
      // 增加源计数
      existing.sourceCount++
      // 保留最近阅读的版本（durChapterTime 更大的）
      if ((book.durChapterTime || 0) > (existing.book.durChapterTime || 0)) {
        existing.book = book
      }
    }
  }
  
  return Array.from(bookMap.values())
})

const filteredBooks = computed(() => {
  if (!searchKeyword.value) return deduplicatedBooks.value
  const keyword = searchKeyword.value.toLowerCase()
  return deduplicatedBooks.value.filter(
    ({ book }) => book.name.toLowerCase().includes(keyword) ||
            (book.author || '').toLowerCase().includes(keyword)
  )
})

const recommendedBooks = computed(() => {
  return [...books.value]
    .sort((a, b) => (b.durChapterTime || 0) - (a.durChapterTime || 0))
    .slice(0, 6)
})

// ====== 方法 ======

async function loadBookshelf() {
  try {
    const res = await bookApi.getBookshelf()
    if (res.isSuccess) {
      books.value = res.data
    } else {
      error(res.errorMsg || '加载书架失败')
    }
  } catch (e) {
    console.error('加载书架失败:', e)
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

async function refresh() {
  refreshing.value = true
  await loadBookshelf()
  success('刷新成功')
}

// 统一的点击处理
function handleBookClick(book: Book) {
  if (isManageMode.value) {
    toggleSelection(book)
  } else {
    router.push({ name: 'reader', query: { url: book.bookUrl } })
  }
}

// 管理模式相关
function toggleManageMode() {
  isManageMode.value = !isManageMode.value
  selectedBooks.value.clear()
}

function toggleSelection(book: Book) {
  if (selectedBooks.value.has(book.bookUrl)) {
    selectedBooks.value.delete(book.bookUrl)
  } else {
    selectedBooks.value.add(book.bookUrl)
  }
}

function selectAll() {
  if (selectedBooks.value.size === filteredBooks.value.length) {
    selectedBooks.value.clear()
  } else {
    filteredBooks.value.forEach(({ book }) => selectedBooks.value.add(book.bookUrl))
  }
}

async function batchDelete() {
  if (selectedBooks.value.size === 0) return
  if (!confirm(`确定要删除选中的 ${selectedBooks.value.size} 本书籍吗？`)) return

  const booksToDelete = books.value.filter(b => selectedBooks.value.has(b.bookUrl))
  try {
    // 假设有 manageApi
    const res = await manageApi.deleteBooks(booksToDelete)
    if (res.isSuccess) {
      books.value = books.value.filter(b => !selectedBooks.value.has(b.bookUrl))
      selectedBooks.value.clear()
      isManageMode.value = false // 删除后退出管理模式？或者保留
      success('删除成功')
    } else {
      error('删除失败')
    }
  } catch (e) {
    error('删除出错')
  }
}

async function deleteBook(book: Book) {
  if (!confirm(`确定要删除《${book.name}》吗？`)) return
  try {
    const res = await bookApi.deleteBook(book.bookUrl)
    if (res.isSuccess) {
      books.value = books.value.filter(b => b.bookUrl !== book.bookUrl)
      success('删除成功')
    }
  } catch (e) {
    error('删除失败')
  }
}

function goSearch() {
  router.push('/search')
}

function getCoverUrl(url?: string) {
  if (!url) return ''
  // 将所有图片请求都通过 cover 接口代理
  return `/reader3/cover?path=${encodeURIComponent(url)}`
}

onMounted(() => {
  loadBookshelf()
})
</script>

<template>
  <div class="min-h-screen bg-background">
    <!-- 导航栏 -->
    <header class="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b">
      <div class="container mx-auto flex h-14 max-w-screen-2xl items-center px-4 gap-4">
        <!-- Logo -->
        <div class="flex items-center gap-2.5 shrink-0">
          <div class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Library class="h-4 w-4 text-primary" />
          </div>
          <span class="font-semibold text-lg hidden sm:inline">阅读</span>
        </div>
        
        <!-- 搜索框 - 居中 -->
        <div class="flex-1 flex justify-center">
          <div class="w-full max-w-md">
            <div class="relative group">
              <Search class="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-foreground" />
              <input
                v-model="searchKeyword"
                type="text"
                placeholder="搜索书架..."
                class="w-full h-9 pl-10 pr-4 rounded-full bg-muted/50 border-0 text-sm
                       placeholder:text-muted-foreground/70
                       focus:outline-none focus:ring-2 focus:ring-primary/20 focus:bg-background
                       transition-all"
              />
            </div>
          </div>
        </div>
        
        <!-- 右侧操作 -->
        <div class="flex items-center gap-1 shrink-0">
          <!-- 添加书籍 -->
          <button 
            class="w-9 h-9 rounded-full hover:bg-muted flex items-center justify-center transition-colors"
            title="搜索添加"
            @click="goSearch"
          >
            <Plus class="h-4.5 w-4.5" />
          </button>
          
          <!-- 刷新 -->
          <button 
            class="w-9 h-9 rounded-full hover:bg-muted flex items-center justify-center transition-colors"
            title="刷新书架"
            @click="refresh"
          >
            <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': refreshing }" />
          </button>
          
          <!-- 暗色模式 -->
          <button 
            class="w-9 h-9 rounded-full hover:bg-muted flex items-center justify-center transition-colors"
            @click="toggleDark()"
          >
            <Moon v-if="!isDark" class="h-4 w-4" />
            <Sun v-else class="h-4 w-4" />
          </button>
          
          <!-- 菜单 -->
          <Sheet v-model:open="showSidebar">
            <SheetTrigger as-child>
              <button class="w-9 h-9 rounded-full hover:bg-muted flex items-center justify-center transition-colors">
                <Settings class="h-4 w-4" />
              </button>
            </SheetTrigger>
            <SheetContent>
              <div class="space-y-6 pt-6">
                <div class="flex items-center justify-between">
                   <h2 class="text-lg font-semibold">菜单</h2>
                   <Button variant="ghost" size="icon" @click="router.push('/settings')">
                      <Settings class="h-4 w-4" />
                   </Button>
                </div>
                

                
                <div class="space-y-4">
                  <div class="flex items-center justify-between">
                    <span class="text-sm">深色模式</span>
                    <Button variant="outline" size="sm" @click="toggleDark()">
                      {{ isDark ? '关闭' : '开启' }}
                    </Button>
                  </div>
                  
                  <div class="flex items-center justify-between">
                    <span class="text-sm">显示进度</span>
                    <Button variant="outline" size="sm" @click="showProgress = !showProgress">
                      {{ showProgress ? '显示' : '隐藏' }}
                    </Button>
                  </div>
                </div>
                

                <div class="space-y-2 pt-4 border-t">
                  <h3 class="text-sm font-medium text-muted-foreground px-1">数据管理</h3>
                  <Button variant="ghost" class="w-full justify-start" @click="router.push('/sources')">
                    <Database class="h-4 w-4 mr-2" />
                    书源管理
                  </Button>
                  <Button variant="ghost" class="w-full justify-start" @click="router.push('/book-group')">
                    <Folder class="h-4 w-4 mr-2" />
                    分组管理
                  </Button>
                  <Button variant="ghost" class="w-full justify-start" @click="toggleManageMode(); showSidebar = false">
                    <CheckSquare class="h-4 w-4 mr-2" />
                    书籍管理
                  </Button>
                   <Button variant="ghost" class="w-full justify-start" @click="router.push('/replace-rule')">
                    <Regex class="h-4 w-4 mr-2" />
                    替换规则
                  </Button>
                  <Button variant="ghost" class="w-full justify-start" @click="router.push('/ai-settings')">
                    <Brain class="h-4 w-4 mr-2" />
                    AI 模型
                  </Button>
                  <Button variant="ghost" class="w-full justify-start" @click="refresh">
                    <RefreshCw class="h-4 w-4 mr-2" />
                    刷新书架
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
    
    <!-- 主内容 -->
    <main class="container mx-auto max-w-screen-2xl px-4 py-6">
      <!-- 加载 -->
      <div v-if="loading" class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-4 sm:gap-6">
        <SkeletonLoader v-for="i in 12" :key="i" type="card" />
      </div>
      
      <!-- 空状态 -->
      <div v-else-if="books.length === 0" class="flex flex-col items-center justify-center py-24">
        <div class="rounded-full bg-muted p-6 mb-6">
          <BookOpen class="h-12 w-12 text-muted-foreground" />
        </div>
        <h2 class="text-xl font-semibold mb-2">书架空空如也</h2>
        <p class="text-muted-foreground mb-6">去添加一些书籍开始阅读吧</p>
        <Button @click="goSearch">
          <Search class="h-4 w-4 mr-2" />
          搜索书籍
        </Button>
      </div>
      
      <!-- 书架 -->
      <template v-else>
        <!-- 继续阅读 -->
        <section v-if="recommendedBooks.length > 0 && !searchKeyword" class="mb-10">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-xl font-bold flex items-center gap-2">
              <div class="p-2 bg-primary/10 rounded-lg">
                <BookOpen class="h-5 w-5 text-primary" />
              </div>
              继续阅读
            </h2>
          </div>
          
          <div class="flex gap-4 sm:gap-5 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide">
             <div
              v-for="book in recommendedBooks"
              :key="book.bookUrl"
              class="flex-shrink-0 w-[120px] sm:w-[140px] md:w-[160px] cursor-pointer group"
              @click="handleBookClick(book)"
            >
              <div class="aspect-[2/3] rounded-xl overflow-hidden bg-muted mb-3 relative
                          shadow-md transition-all duration-300 ease-out
                          group-hover:-translate-y-2 group-hover:shadow-xl group-hover:shadow-primary/15">
                <img
                  v-if="book.coverUrl"
                  :src="getCoverUrl(book.coverUrl)"
                  :alt="book.name"
                  class="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  @error="(e: Event) => (e.target as HTMLImageElement).style.display = 'none'"
                />
                <div class="w-full h-full flex items-center justify-center absolute inset-0 -z-10">
                  <BookOpen class="h-8 w-8 text-muted-foreground" />
                </div>
                <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent opacity-0 group-hover:opacity-100 flex items-end justify-center pb-6 transition-opacity duration-300">
                  <span class="px-3 py-1 bg-white/20 backdrop-blur-sm text-white text-xs font-medium rounded-full border border-white/30">继续阅读</span>
                </div>
                <div class="absolute bottom-0 inset-x-0 h-1.5 bg-black/20">
                  <div 
                    class="h-full bg-gradient-to-r from-emerald-400 to-cyan-400 rounded-r-full"
                    :style="{ width: `${book.totalChapterNum ? (book.durChapterIndex || 0) / book.totalChapterNum * 100 : 0}%` }"
                  />
                </div>
              </div>
              <h3 class="font-medium text-sm truncate">{{ book.name }}</h3>
              <p class="text-xs text-muted-foreground truncate">{{ book.author || '未知作者' }}</p>
            </div>
          </div>
        </section>
        
        <!-- 我的书架 -->
        <section>
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-xl font-bold flex items-center gap-2">
              <div class="p-2 bg-primary/10 rounded-lg">
                <Library class="h-5 w-5 text-primary" />
              </div>
              {{ searchKeyword ? '搜索结果' : '我的书架' }}
              <span class="text-sm font-normal text-muted-foreground">({{ filteredBooks.length }})</span>
            </h2>
            <div class="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="sm"
                :class="{ 'bg-accent text-accent-foreground': isManageMode }"
                @click="toggleManageMode"
              >
                <CheckSquare class="h-4 w-4 mr-1" />
                {{ isManageMode ? '退出' : '管理' }}
              </Button>
              <Button variant="ghost" size="icon" :class="{ 'animate-spin': refreshing }" @click="refresh">
                <RefreshCw class="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-4 sm:gap-6 content-start">
            <div
              v-for="{ book, sourceCount } in filteredBooks"
              :key="book.bookUrl"
              class="relative"
            >
              <BookCard
                :book="book"
                :show-progress="showProgress"
                :manage-mode="isManageMode"
                :selected="selectedBooks.has(book.bookUrl)"
                @click="handleBookClick"
                @delete="deleteBook"
              />
              <!-- 多源标识 -->
              <div 
                v-if="sourceCount > 1"
                class="absolute -top-1 -right-1 px-1.5 py-0.5 bg-primary text-primary-foreground text-[10px] font-medium rounded-full shadow-sm"
              >
                {{ sourceCount }}源
              </div>
            </div>
          </div>
          
          <div v-if="searchKeyword && filteredBooks.length === 0" class="py-16 text-center text-muted-foreground">
            未找到匹配的书籍
          </div>
        </section>
      </template>
    </main>

    <!-- 底部批量操作栏 -->
    <div v-if="isManageMode" class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
       <div class="bg-popover border shadow-xl rounded-full px-6 py-2 flex items-center gap-4 animate-in slide-in-from-bottom-2 fade-in">
          <Button variant="ghost" size="sm" @click="selectAll">
             {{ selectedBooks.size === filteredBooks.length ? '取消全选' : '全选' }}
          </Button>
          <div class="h-4 w-px bg-border"></div>
          <span class="text-sm font-medium whitespace-nowrap">已选 {{ selectedBooks.size }} 本</span>
          <div class="h-4 w-px bg-border"></div>
          <Button variant="ghost" size="sm" class="text-destructive hover:bg-destructive/10" @click="batchDelete" :disabled="selectedBooks.size === 0">
            <Trash2 class="h-4 w-4 mr-2" />
            删除
          </Button>
          <Button variant="ghost" size="icon" class="ml-2 -mr-2 text-muted-foreground" @click="toggleManageMode">
            <X class="h-4 w-4" />
          </Button>
       </div>
    </div>
  </div>
</template>

<style scoped>
.scrollbar-hide {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
</style>
