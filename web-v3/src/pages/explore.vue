<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { 
  ArrowLeft, Search, BookOpen, ChevronRight, LayoutGrid, List
} from 'lucide-vue-next'
import { exploreApi } from '@/api/explore'
import { sourceApi, type BookSource } from '@/api/source'
import { type Book } from '@/api/book'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { SkeletonLoader } from '@/components/ui'
import { useMessage } from '@/composables/useMessage'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

const router = useRouter()
const { success, error, info } = useMessage()

// State
const sources = ref<BookSource[]>([])
const loadingSources = ref(true)
const activeSourceUrl = ref<string | undefined>(undefined)

// Selected Category State
const currentCategory = ref<{
  name: string
  url: string
  sourceUrl: string
  sourceName: string
} | null>(null)

const books = ref<Book[]>([])
const page = ref(1)
const loadingBooks = ref(false)
const hasMore = ref(true)

// Helper to parse exploreUrl
function getExploreCategories(source: BookSource) {
  if (!source.exploreUrl) return []
  
  let result: { name: string; url: string }[][] = []
  let zone: { name: string; url: string }[] = []
  let list: any[] = []

  try {
    // Try JSON first
    list = JSON.parse(source.exploreUrl)
  } catch (e) {
    // Try simple parse or line split
    // Simple line split fallback
    source.exploreUrl.replace(/\r\n/g, "\n").split("\n").forEach(v => {
        if (!v) {
            if (zone.length) {
                result.push(zone)
                zone = []
            }
        } else {
            const parts = v.split("::")
            if (parts.length >= 2) {
                zone.push({ name: parts[0], url: parts[1] })
            }
        }
    })
    if (zone.length) result.push(zone);
    return result; // Fallback return for non-JSON
  }

  // Handle JSON
  if (Array.isArray(list) && list.length) {
    let percent = 0
    list.forEach(v => {
      const basisPercent = (v.style && v.style.layout_flexBasisPercent) || 0.25
      zone.push({ name: v.title, url: v.url })
      percent += basisPercent
      if (percent >= 1) {
        result.push(zone)
        zone = []
        percent = 0
      }
    })
    if (zone.length) result.push(zone)
  }

  return result
}

// Data Loading
async function loadSources() {
  loadingSources.value = true
  try {
    const res = await sourceApi.getAvailableBookSource() // or getBookSources
    if (res.isSuccess && res.data) {
      // Filter sources with exploreUrl
      sources.value = res.data.filter(s => !!s.exploreUrl)
    }
  } catch (e) {
    error('加载书源失败')
  } finally {
    loadingSources.value = false
  }
}

async function loadBooks(isLoadMore = false) {
  if (!currentCategory.value) return
  if (loadingBooks.value) return
  if (isLoadMore && !hasMore.value) return

  loadingBooks.value = true
  if (!isLoadMore) {
    books.value = []
    page.value = 1
    hasMore.value = true
  } else {
    page.value++
  }

  try {
    const res = await exploreApi.exploreBook({
      ruleFindUrl: currentCategory.value.url,
      bookSourceUrl: currentCategory.value.sourceUrl,
      page: page.value
    })

    if (res.isSuccess) {
      if (res.data && res.data.length > 0) {
        if (isLoadMore) {
          // De-duplicate
          const existingIds = new Set(books.value.map(b => b.bookUrl))
          const newBooks = res.data.filter(b => !existingIds.has(b.bookUrl))
          books.value.push(...newBooks)
          if (newBooks.length === 0) hasMore.value = false
        } else {
          books.value = res.data
        }
      } else {
        hasMore.value = false
      }
    } else {
      error(res.errorMsg || '加载失败')
    }
  } catch (e) {
    error('请求出错')
  } finally {
    loadingBooks.value = false
  }
}

// Actions
function selectCategory(cat: { name: string; url: string }, source: BookSource) {
  currentCategory.value = {
    name: cat.name,
    url: cat.url,
    sourceUrl: source.bookSourceUrl,
    sourceName: source.bookSourceName
  }
  loadBooks()
}

function goBack() {
  if (currentCategory.value) {
    currentCategory.value = null
    books.value = []
  } else {
    router.push('/')
  }
}

function openBook(book: Book) {
  router.push({ name: 'reader', query: { url: book.bookUrl } })
}

// Infinite Scroll Handle
function handleScroll(e: Event) {
  const target = e.target as HTMLElement
  if (target.scrollHeight - target.scrollTop - target.clientHeight < 200) {
    loadBooks(true)
  }
}

onMounted(() => {
  loadSources()
})
</script>

<template>
  <div class="min-h-screen bg-background flex flex-col h-screen">
    <!-- Header -->
    <header class="sticky top-0 z-50 w-full bg-background/95 backdrop-blur border-b flex-shrink-0">
      <div class="container flex h-14 max-w-screen-2xl items-center gap-4 px-4">
        <Button variant="ghost" size="icon" @click="goBack">
          <ArrowLeft class="h-4 w-4" />
        </Button>
        <div class="flex-1 min-w-0">
          <h1 class="font-semibold truncate" v-if="currentCategory">
            {{ currentCategory.name }} 
            <span class="text-xs font-normal text-muted-foreground ml-2">{{ currentCategory.sourceName }}</span>
          </h1>
          <h1 class="font-semibold" v-else>发现</h1>
        </div>
      </div>
    </header>

    <!-- Content -->
    <main class="flex-1 overflow-hidden relative">
      <!-- Source List -->
      <div v-if="!currentCategory" class="h-full overflow-y-auto px-4 py-4 space-y-4">
        <div v-if="loadingSources" class="space-y-4">
          <SkeletonLoader v-for="i in 5" :key="i" type="text" :lines="2" />
        </div>
        
        <div v-else-if="sources.length > 0">
           <Accordion type="single" collapsible v-model="activeSourceUrl">
             <AccordionItem v-for="source in sources" :key="source.bookSourceUrl" :value="source.bookSourceUrl">
                <AccordionTrigger class="hover:no-underline">
                  <div class="flex flex-col items-start gap-1 py-1">
                     <span class="font-medium text-left">{{ source.bookSourceName }}</span>
                     <span class="text-xs text-muted-foreground font-normal no-underline">{{ source.bookSourceGroup || '未分组' }}</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                   <div class="space-y-3 pt-2">
                      <div v-for="(group, gIdx) in getExploreCategories(source)" :key="gIdx" class="flex flex-wrap gap-2">
                        <Button 
                          v-for="(cat, cIdx) in group" 
                          :key="cIdx"
                          variant="outline"
                          size="sm"
                          class="h-7 text-xs"
                          @click="selectCategory(cat, source)"
                        >
                          {{ cat.name }}
                        </Button>
                      </div>
                   </div>
                </AccordionContent>
             </AccordionItem>
           </Accordion>
        </div>

        <div v-else class="flex flex-col items-center justify-center h-64 text-muted-foreground">
           <BookOpen class="h-10 w-10 mb-2 opacity-50" />
           <p>暂无可用发现源</p>
        </div>
      </div>

      <!-- Book List (Result) -->
      <div 
        v-else 
        class="h-full overflow-y-auto px-4 py-4"
        @scroll="handleScroll"
      >
        <div v-if="books.length > 0" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 pb-8">
           <div 
             v-for="book in books" 
             :key="book.bookUrl"
             class="group cursor-pointer space-y-2"
             @click="openBook(book)"
           >
              <div class="aspect-[2/3] rounded-md bg-muted overflow-hidden relative shadow-sm transition-all group-hover:shadow-md">
                 <img v-if="book.coverUrl" :src="book.coverUrl" class="w-full h-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
                 <div v-else class="w-full h-full flex items-center justify-center bg-secondary/50">
                    <BookOpen class="h-8 w-8 text-muted-foreground/50" />
                 </div>
              </div>
              <div class="space-y-1">
                 <h3 class="font-medium text-sm leading-snug line-clamp-2" :title="book.name">{{ book.name }}</h3>
                 <p class="text-xs text-muted-foreground truncate">{{ book.author }}</p>
              </div>
           </div>
        </div>

        <div v-if="loadingBooks" class="py-4 flex justify-center">
           <SkeletonLoader type="text" :lines="1" class="w-32" />
        </div>

        <div v-if="!loadingBooks && books.length === 0" class="flex flex-col items-center justify-center h-64 text-muted-foreground">
           <p>暂无书籍</p>
        </div>
        
        <div v-if="!hasMore && books.length > 0" class="py-4 text-center text-xs text-muted-foreground">
           没有更多了
        </div>
      </div>
    </main>
  </div>
</template>
