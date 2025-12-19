<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  NLayout,
  NLayoutHeader,
  NLayoutContent,
  NInput,
  NButton,
  NGrid,
  NGridItem,
  NEmpty,
  NSpin,
  NSpace,
  NSelect,
  NTag,
  useMessage,
} from 'naive-ui'
import { useDark } from '@vueuse/core'
import { bookApi, $get, type Book } from '@/api'
import BookCard from '@/components/book/BookCard.vue'

const router = useRouter()
const message = useMessage()
const isDark = useDark()

// ====== 状态 ======
const searchKeyword = ref('')
const searchResult = ref<Book[]>([])
const loading = ref(false)
const hasSearched = ref(false)

// 搜索设置
const searchType = ref<'multi' | 'single'>('multi')
const bookSourceUrl = ref('')
const bookSourceGroup = ref('')
const concurrentCount = ref(8)

// 书源列表（简化版）
const bookSourceList = ref<Array<{ bookSourceName: string; bookSourceUrl: string }>>([])
const bookSourceGroupList = ref<Array<{ name: string; value: string }>>([])

// ====== 计算属性 ======
const searchTypeOptions = [
  { label: '多源搜索', value: 'multi' },
  { label: '单源搜索', value: 'single' },
]

const concurrentOptions = [4, 8, 12, 16, 20].map(n => ({
  label: `${n} 并发`,
  value: n,
}))

// ====== 方法 ======

// 搜索书籍
async function searchBooks() {
  if (!searchKeyword.value.trim()) {
    message.warning('请输入搜索关键词')
    return
  }

  loading.value = true
  hasSearched.value = true
  searchResult.value = []

  try {
    const res = await bookApi.search(searchKeyword.value)
    if (res.isSuccess) {
      searchResult.value = res.data
      if (res.data.length === 0) {
        message.info('未找到相关书籍')
      } else {
        message.success(`找到 ${res.data.length} 本书籍`)
      }
    } else {
      message.error(res.errorMsg || '搜索失败')
    }
  } catch (error) {
    console.error('搜索失败:', error)
    message.error('搜索请求失败')
  } finally {
    loading.value = false
  }
}

// 添加到书架
async function addToShelf(book: Book) {
  try {
    const res = await bookApi.saveBook(book)
    if (res.isSuccess) {
      message.success(`《${book.name}》已添加到书架`)
    } else {
      message.error(res.errorMsg || '添加失败')
    }
  } catch (error) {
    message.error('添加到书架失败')
  }
}

// 查看书籍详情/阅读
function openBook(book: Book) {
  router.push({
    name: 'reader',
    query: { url: book.bookUrl },
  })
}

// 返回首页
function goHome() {
  router.push('/')
}

// 处理回车搜索
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    searchBooks()
  }
}
</script>

<template>
  <NLayout class="min-h-screen bg-surface dark:bg-surface-dark">
    <!-- 顶部栏 -->
    <NLayoutHeader
      bordered
      class="h-16 flex items-center px-6 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm sticky top-0 z-10"
    >
      <NButton quaternary @click="goHome" class="mr-4">
        <span class="text-lg">←</span>
      </NButton>
      
      <div class="flex-1 flex items-center gap-4 max-w-4xl">
        <NInput
          v-model:value="searchKeyword"
          placeholder="输入书名或作者搜索..."
          clearable
          size="large"
          @keydown="handleKeydown"
        >
          <template #prefix>
            <span class="opacity-50">🔍</span>
          </template>
        </NInput>
        
        <NButton 
          type="primary" 
          size="large"
          :loading="loading"
          @click="searchBooks"
        >
          搜索
        </NButton>
      </div>
    </NLayoutHeader>

    <!-- 搜索设置 -->
    <div class="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-gray-700 px-6 py-3">
      <NSpace>
        <NSelect
          v-model:value="searchType"
          :options="searchTypeOptions"
          style="width: 120px"
          size="small"
        />
        <NSelect
          v-model:value="concurrentCount"
          :options="concurrentOptions"
          style="width: 100px"
          size="small"
        />
        <NTag v-if="hasSearched" type="info">
          共 {{ searchResult.length }} 条结果
        </NTag>
      </NSpace>
    </div>

    <!-- 搜索结果 -->
    <NLayoutContent class="p-6">
      <NSpin :show="loading">
        <!-- 结果网格 -->
        <NGrid
          v-if="searchResult.length > 0"
          :x-gap="20"
          :y-gap="20"
          cols="2 s:3 m:4 l:5 xl:6"
          responsive="screen"
        >
          <NGridItem v-for="book in searchResult" :key="book.bookUrl">
            <BookCard
              :book="book"
              :show-add-button="true"
              @click="openBook"
              @add="addToShelf"
            />
          </NGridItem>
        </NGrid>

        <!-- 空状态 -->
        <NEmpty
          v-else-if="!loading && hasSearched"
          description="未找到相关书籍"
          class="py-20"
        />

        <!-- 初始状态 -->
        <div 
          v-else-if="!loading && !hasSearched"
          class="py-20 text-center"
        >
          <div class="text-6xl mb-4 opacity-30">📚</div>
          <p class="text-gray-500 dark:text-gray-400">
            输入书名或作者名开始搜索
          </p>
          <p class="text-sm text-gray-400 dark:text-gray-500 mt-2">
            支持多书源同时搜索
          </p>
        </div>
      </NSpin>
    </NLayoutContent>
  </NLayout>
</template>

<style scoped>
.backdrop-blur-sm {
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
</style>
