<script setup lang="ts">
/**
 * 首页/书架 - shadcn-vue
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useDark, useToggle, useStorage } from '@vueuse/core'
import { 
  Search, Plus, Settings, Moon, Sun, RefreshCw, 
  BookOpen, Library, ChevronRight
} from 'lucide-vue-next'
import { bookApi, type Book } from '@/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
const filteredBooks = computed(() => {
  if (!searchKeyword.value) return books.value
  const keyword = searchKeyword.value.toLowerCase()
  return books.value.filter(
    book => book.name.toLowerCase().includes(keyword) ||
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

function openBook(book: Book) {
  router.push({ name: 'reader', query: { url: book.bookUrl } })
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

onMounted(() => {
  loadBookshelf()
})
</script>

<template>
  <div class="min-h-screen bg-background">
    <!-- 导航栏 -->
    <header class="sticky top-0 z-50 w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div class="container flex h-14 max-w-screen-2xl items-center px-4">
        <!-- Logo -->
        <div class="mr-4 flex items-center gap-2">
          <Library class="h-5 w-5" />
          <span class="font-semibold">阅读</span>
        </div>
        
        <!-- 搜索 -->
        <div class="flex-1 flex justify-center">
          <div class="w-full max-w-md relative">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              v-model="searchKeyword"
              placeholder="搜索书架..."
              class="pl-9"
            />
          </div>
        </div>
        
        <!-- 操作 -->
        <div class="ml-4 flex items-center gap-1">
          <Button variant="ghost" size="icon" @click="goSearch">
            <Plus class="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" @click="toggleDark()">
            <Moon v-if="!isDark" class="h-4 w-4" />
            <Sun v-else class="h-4 w-4" />
          </Button>
          <Sheet v-model:open="showSidebar">
            <SheetTrigger as-child>
              <Button variant="ghost" size="icon">
                <Settings class="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent>
              <div class="space-y-6 pt-6">
                <h2 class="text-lg font-semibold">设置</h2>
                
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
                  <Button variant="outline" class="w-full" @click="router.push('/sources')">
                    书源管理
                  </Button>
                  <Button variant="outline" class="w-full" @click="refresh">
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
    <main class="container max-w-screen-2xl px-4 py-6">
      <!-- 加载 -->
      <div v-if="loading" class="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
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
        <section v-if="recommendedBooks.length > 0 && !searchKeyword" class="mb-8">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-semibold flex items-center gap-2">
              <BookOpen class="h-5 w-5" />
              继续阅读
            </h2>
            <Button variant="ghost" size="sm" class="text-muted-foreground">
              查看全部 <ChevronRight class="h-4 w-4" />
            </Button>
          </div>
          
          <div class="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
            <div
              v-for="book in recommendedBooks"
              :key="book.bookUrl"
              class="flex-shrink-0 w-[140px] md:w-[160px] cursor-pointer group"
              @click="openBook(book)"
            >
              <div class="aspect-[2/3] rounded-lg overflow-hidden bg-muted mb-3 relative">
                <img
                  v-if="book.coverUrl"
                  :src="`/reader3/cover?path=${encodeURIComponent(book.coverUrl)}`"
                  :alt="book.name"
                  class="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
                <div v-else class="w-full h-full flex items-center justify-center">
                  <BookOpen class="h-8 w-8 text-muted-foreground" />
                </div>
                <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <span class="text-white text-sm font-medium">继续阅读</span>
                </div>
                <div class="absolute bottom-0 inset-x-0 h-1 bg-muted">
                  <div 
                    class="h-full bg-primary"
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
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-semibold flex items-center gap-2">
              <Library class="h-5 w-5" />
              {{ searchKeyword ? '搜索结果' : '我的书架' }}
              <span class="text-sm font-normal text-muted-foreground">({{ filteredBooks.length }})</span>
            </h2>
            <Button variant="ghost" size="icon" :class="{ 'animate-spin': refreshing }" @click="refresh">
              <RefreshCw class="h-4 w-4" />
            </Button>
          </div>
          
          <div class="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
            <BookCard
              v-for="book in filteredBooks"
              :key="book.bookUrl"
              :book="book"
              :show-progress="showProgress"
              @click="openBook"
              @delete="deleteBook"
            />
          </div>
          
          <div v-if="searchKeyword && filteredBooks.length === 0" class="py-16 text-center text-muted-foreground">
            未找到匹配的书籍
          </div>
        </section>
      </template>
    </main>
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
