<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { 
  ArrowLeft, Search, Trash2, FolderInput, FolderMinus, Filter, X
} from 'lucide-vue-next'
import { bookApi, type Book } from '@/api/book'
import { groupApi, type BookGroup } from '@/api/group'
import { manageApi } from '@/api/manage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { SkeletonLoader } from '@/components/ui'
import { useMessage } from '@/composables/useMessage'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const router = useRouter()
const { success, error } = useMessage()

const books = ref<Book[]>([])
const groups = ref<BookGroup[]>([])
const loading = ref(true)
const searchKeyword = ref('')
const selectedBooks = ref<Set<string>>(new Set()) // Store bookUrl

const filteredBooks = computed(() => {
  let list = books.value
  if (searchKeyword.value) {
    const keyword = searchKeyword.value.toLowerCase()
    list = list.filter(b => 
      b.name.toLowerCase().includes(keyword) || 
      b.author.toLowerCase().includes(keyword)
    )
  }
  return list
})

const isAllSelected = computed(() => {
  return filteredBooks.value.length > 0 && selectedBooks.value.size === filteredBooks.value.length
})

async function loadData() {
  loading.value = true
  try {
    const [booksRes, groupsRes] = await Promise.all([
      bookApi.getBookshelf(), // assuming getBookshelf returns list
      groupApi.getBookGroups()
    ])
    
    if (booksRes.isSuccess) {
      books.value = booksRes.data || []
    }
    if (groupsRes.isSuccess) {
      groups.value = groupsRes.data || []
    }
  } catch (e) {
    error('加载数据失败')
  } finally {
    loading.value = false
  }
}

function getGroupNames(book: Book) {
  if (!book.group) return ''
  return groups.value
    .filter(g => (g.groupId & book.group) !== 0)
    .map(g => g.groupName)
    .join(' ')
}

function toggleSelectAll() {
  if (isAllSelected.value) {
    selectedBooks.value.clear()
  } else {
    filteredBooks.value.forEach(b => selectedBooks.value.add(b.bookUrl))
  }
}

function toggleSelect(book: Book) {
  if (selectedBooks.value.has(book.bookUrl)) {
    selectedBooks.value.delete(book.bookUrl)
  } else {
    selectedBooks.value.add(book.bookUrl)
  }
}

async function handleBatchDelete() {
  if (selectedBooks.value.size === 0) return
  if (!confirm(`确定删除选中的 ${selectedBooks.value.size} 本书籍？`)) return
  
  const booksToDelete = books.value.filter(b => selectedBooks.value.has(b.bookUrl))
  try {
    const res = await manageApi.deleteBooks(booksToDelete)
    if (res.isSuccess) {
      success('删除成功')
      selectedBooks.value.clear()
      loadData()
    } else {
      error('删除失败')
    }
  } catch (e) {
    error('删除出错')
  }
}

async function handleBatchGroup(group: BookGroup, isAdd: boolean) {
  if (selectedBooks.value.size === 0) return
  const booksToOperate = books.value.filter(b => selectedBooks.value.has(b.bookUrl))
  
  try {
    const api = isAdd ? manageApi.addBookGroupMulti : manageApi.removeBookGroupMulti
    const res = await api(group.groupId, booksToOperate)
    if (res.isSuccess) {
      success((isAdd ? '添加' : '移除') + '分组成功')
      selectedBooks.value.clear()
      loadData()
    } else {
      error('操作失败')
    }
  } catch (e) {
    error('操作出错')
  }
}

function goBack() {
  router.push('/')
}

onMounted(() => {
  loadData()
})
</script>

<template>
  <div class="min-h-screen bg-background">
    <header class="sticky top-0 z-50 w-full bg-background/95 backdrop-blur border-b">
      <div class="container flex h-14 max-w-screen-2xl items-center justify-between px-4">
        <div class="flex items-center gap-4">
          <Button variant="ghost" size="icon" @click="goBack">
            <ArrowLeft class="h-4 w-4" />
          </Button>
          <div>
            <h1 class="font-semibold">书籍管理</h1>
            <p class="text-xs text-muted-foreground" v-if="selectedBooks.size > 0">已选 {{ selectedBooks.size }} 本</p>
            <p class="text-xs text-muted-foreground" v-else>共 {{ books.length }} 本</p>
          </div>
        </div>
        
        <div class="relative w-40 sm:w-64">
           <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
           <Input v-model="searchKeyword" placeholder="搜索书籍..." class="pl-9 h-8" />
        </div>
      </div>
    </header>

    <main class="container max-w-screen-2xl px-4 py-6">
      
      <!-- Actions Bar -->
      <div class="flex items-center justify-between mb-4 px-2 overflow-x-auto pb-2">
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2 mr-2">
            <input type="checkbox" :checked="isAllSelected" @change="toggleSelectAll" class="w-4 h-4 rounded border-gray-300">
            <span class="text-sm">全选</span>
          </div>

          <div v-if="selectedBooks.size > 0" class="flex items-center gap-2">
            <Button variant="ghost" size="sm" class="text-destructive h-8" @click="handleBatchDelete">
              <Trash2 class="h-4 w-4 mr-2" />
              删除
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button variant="ghost" size="sm" class="h-8">
                  <FolderInput class="h-4 w-4 mr-2" />
                  加入分组
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem v-for="g in groups" :key="g.groupId" @click="handleBatchGroup(g, true)">
                  {{ g.groupName }}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button variant="ghost" size="sm" class="h-8">
                  <FolderMinus class="h-4 w-4 mr-2" />
                  移出分组
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem v-for="g in groups" :key="g.groupId" @click="handleBatchGroup(g, false)">
                  {{ g.groupName }}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div v-if="loading" class="space-y-3">
        <SkeletonLoader v-for="i in 10" :key="i" type="text" :lines="2" />
      </div>

      <div v-else-if="filteredBooks.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <div 
          v-for="book in filteredBooks" 
          :key="book.bookUrl"
          class="flex items-center p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer"
          @click="toggleSelect(book)"
        >
          <div class="flex items-center mr-3" @click.stop>
             <input type="checkbox" :checked="selectedBooks.has(book.bookUrl)" @change="toggleSelect(book)" class="w-5 h-5 rounded border-gray-300">
          </div>
          
          <div class="h-16 w-12 rounded overflow-hidden bg-muted flex-shrink-0 mr-3">
            <img v-if="book.coverUrl" :src="book.coverUrl" class="h-full w-full object-cover" loading="lazy" />
          </div>

          <div class="flex-1 min-w-0">
            <h3 class="font-medium text-sm truncate">{{ book.name }}</h3>
            <p class="text-xs text-muted-foreground truncate">{{ book.author }}</p>
            <div class="mt-1 flex flex-wrap gap-1">
               <Badge variant="outline" class="text-[10px] h-4 px-1 font-normal text-muted-foreground" v-if="book.group">
                 {{ getGroupNames(book) }}
               </Badge>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="text-center py-12 text-muted-foreground">
        未找到书籍
      </div>
    </main>
  </div>
</template>
