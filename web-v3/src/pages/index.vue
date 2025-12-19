<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  NLayout,
  NLayoutHeader,
  NLayoutSider,
  NLayoutContent,
  NInput,
  NButton,
  NGrid,
  NGridItem,
  NEmpty,
  NSpin,
  NSpace,
  NIcon,
  NDropdown,
  NTag,
  NSwitch,
  NModal,
  NTabs,
  NTabPane,
  NForm,
  NFormItem,
  NSelect,
  useMessage,
  useDialog,
} from 'naive-ui'
import { useStorage, useDark, useToggle } from '@vueuse/core'
import { bookApi, type Book } from '@/api'
import { useUserStore, useSettingsStore } from '@/stores'
import BookCard from '@/components/book/BookCard.vue'

const router = useRouter()
const message = useMessage()
const dialog = useDialog()
const userStore = useUserStore()
const settingsStore = useSettingsStore()

// ====== 状态 ======
const books = ref<Book[]>([])
const loading = ref(false)
const refreshLoading = ref(false)
const searchKeyword = ref('')
const showSidebar = ref(true)
const searchResult = ref<Book[]>([])
const isSearchMode = ref(false)

// API 配置
const apiUrl = useStorage('reader-api', location.host + '/reader3')
const connected = ref(false)

// 暗色模式
const isDark = useDark()
const toggleDark = useToggle(isDark)

// ====== 计算属性 ======
const displayBooks = computed(() => {
  if (isSearchMode.value) {
    return searchResult.value
  }
  
  if (!searchKeyword.value) return books.value
  
  const keyword = searchKeyword.value.toLowerCase()
  return books.value.filter(
    (book) =>
      book.name.toLowerCase().includes(keyword) ||
      book.author?.toLowerCase().includes(keyword)
  )
})

const connectionStatus = computed(() => {
  if (loading.value) return { type: 'warning' as const, text: '连接中...' }
  if (connected.value) return { type: 'success' as const, text: '已连接' }
  return { type: 'error' as const, text: '未连接' }
})

// ====== 方法 ======

// 加载书架
async function loadBookshelf(refresh = false) {
  if (refresh) {
    refreshLoading.value = true
  } else {
    loading.value = true
  }
  
  try {
    const res = await bookApi.getBookshelf(refresh)
    if (res.isSuccess) {
      books.value = res.data
      connected.value = true
    } else {
      message.error(res.errorMsg || '加载书架失败')
    }
  } catch (error) {
    console.error('加载书架失败:', error)
    message.error('无法连接到后端服务')
    connected.value = false
  } finally {
    loading.value = false
    refreshLoading.value = false
  }
}

// 搜索书籍
async function searchBooks() {
  if (!searchKeyword.value.trim()) {
    message.warning('请输入搜索关键词')
    return
  }
  
  isSearchMode.value = true
  loading.value = true
  
  try {
    const res = await bookApi.search(searchKeyword.value)
    if (res.isSuccess) {
      searchResult.value = res.data
      if (res.data.length === 0) {
        message.info('未找到相关书籍')
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

// 返回书架
function backToShelf() {
  isSearchMode.value = false
  searchResult.value = []
  searchKeyword.value = ''
}

// 打开书籍
function openBook(book: Book) {
  router.push({
    name: 'reader',
    query: { url: book.bookUrl },
  })
}

// 添加到书架
async function addToShelf(book: Book) {
  try {
    const res = await bookApi.saveBook(book)
    if (res.isSuccess) {
      message.success('已添加到书架')
      loadBookshelf()
    } else {
      message.error(res.errorMsg || '添加失败')
    }
  } catch (error) {
    message.error('添加到书架失败')
  }
}

// 删除书籍
async function deleteBook(book: Book) {
  dialog.warning({
    title: '确认删除',
    content: `确定要从书架移除《${book.name}》吗？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        const res = await bookApi.deleteBook(book.bookUrl)
        if (res.isSuccess) {
          message.success('删除成功')
          loadBookshelf()
        }
      } catch (error) {
        message.error('删除失败')
      }
    }
  })
}

// 刷新书架
function refreshShelf() {
  loadBookshelf(true)
}

// 初始化
onMounted(() => {
  loadBookshelf()
})

// 监听搜索输入，按回车搜索
function handleSearchKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    searchBooks()
  }
}
</script>

<template>
  <NLayout class="min-h-screen" has-sider>
    <!-- 侧边栏 -->
    <NLayoutSider
      v-if="showSidebar"
      bordered
      :width="280"
      :collapsed-width="0"
      collapse-mode="width"
      :native-scrollbar="false"
      class="bg-white dark:bg-zinc-900"
    >
      <div class="p-4 space-y-6">
        <!-- Logo -->
        <div class="text-center py-4">
          <h1 class="text-2xl font-bold bg-gradient-to-r from-primary to-primary-600 bg-clip-text text-transparent">
            阅读
          </h1>
          <p class="text-xs text-gray-400 mt-1">清风不识字，何故乱翻书</p>
        </div>

        <!-- 搜索 -->
        <div class="space-y-2">
          <NInput
            v-model:value="searchKeyword"
            placeholder="搜索书籍..."
            clearable
            @keydown="handleSearchKeydown"
          >
            <template #prefix>
              <span class="text-gray-400">🔍</span>
            </template>
          </NInput>
          <NButton
            type="primary"
            block
            :loading="loading && isSearchMode"
            @click="searchBooks"
          >
            搜索书籍
          </NButton>
        </div>

        <!-- 连接状态 -->
        <div class="space-y-3">
          <div class="text-sm font-medium text-gray-500 dark:text-gray-400">后端连接</div>
          <NTag :type="connectionStatus.type" round>
            {{ connectionStatus.text }}
          </NTag>
        </div>

        <!-- 快捷操作 -->
        <div class="space-y-3">
          <div class="text-sm font-medium text-gray-500 dark:text-gray-400">快捷操作</div>
          <div class="grid grid-cols-2 gap-2">
            <NButton size="small" quaternary @click="refreshShelf">
              刷新书架
            </NButton>
            <NButton size="small" quaternary @click="router.push('/sources')">
              书源管理
            </NButton>
          </div>
        </div>

        <!-- 主题切换 -->
        <div class="flex items-center justify-between py-2">
          <span class="text-sm text-gray-500 dark:text-gray-400">深色模式</span>
          <NSwitch :value="isDark" @update:value="toggleDark()" />
        </div>
      </div>
    </NLayoutSider>

    <!-- 主内容区 -->
    <NLayout>
      <!-- 顶部栏 -->
      <NLayoutHeader
        bordered
        class="h-16 flex items-center justify-between px-6 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm"
      >
        <div class="flex items-center gap-4">
          <NButton
            quaternary
            circle
            @click="showSidebar = !showSidebar"
          >
            <span class="text-xl">☰</span>
          </NButton>
          <h2 class="text-lg font-semibold">
            {{ isSearchMode ? '搜索结果' : '我的书架' }}
            <span class="text-sm text-gray-400 font-normal ml-2">
              ({{ displayBooks.length }})
            </span>
          </h2>
        </div>

        <NSpace>
          <NButton
            v-if="isSearchMode"
            @click="backToShelf"
          >
            返回书架
          </NButton>
          <NButton
            :loading="refreshLoading"
            @click="refreshShelf"
          >
            {{ refreshLoading ? '刷新中...' : '刷新' }}
          </NButton>
        </NSpace>
      </NLayoutHeader>

      <!-- 内容区 -->
      <NLayoutContent class="p-6 bg-surface dark:bg-surface-dark">
        <NSpin :show="loading && !isSearchMode">
          <!-- 书籍网格 -->
          <NGrid
            v-if="displayBooks.length > 0"
            :x-gap="20"
            :y-gap="20"
            cols="2 s:3 m:4 l:5 xl:6"
            responsive="screen"
          >
            <NGridItem v-for="book in displayBooks" :key="book.bookUrl">
              <BookCard
                :book="book"
                :show-add-button="isSearchMode"
                @click="openBook"
                @add="addToShelf"
                @delete="deleteBook"
              />
            </NGridItem>
          </NGrid>

          <!-- 空状态 -->
          <NEmpty
            v-else-if="!loading"
            :description="isSearchMode ? '未找到相关书籍' : '书架空空如也'"
            class="py-20"
          >
            <template #extra>
              <NButton v-if="!isSearchMode" type="primary">
                搜索添加书籍
              </NButton>
            </template>
          </NEmpty>
        </NSpin>
      </NLayoutContent>
    </NLayout>
  </NLayout>
</template>

<style scoped>
/* 自定义滚动条 */
:deep(.n-layout-sider-scroll-container) {
  scrollbar-width: thin;
}

/* 毛玻璃效果 */
.backdrop-blur-sm {
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
</style>
