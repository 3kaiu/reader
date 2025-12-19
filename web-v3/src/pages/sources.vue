<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  NLayout,
  NLayoutHeader,
  NLayoutContent,
  NButton,
  NSpace,
  NDataTable,
  NInput,
  NEmpty,
  NSpin,
  NTag,
  NPopconfirm,
  useMessage,
  type DataTableColumns,
} from 'naive-ui'
import { $get, $post } from '@/api'

const router = useRouter()
const message = useMessage()

// ====== 类型定义 ======
interface BookSource {
  bookSourceName: string
  bookSourceUrl: string
  bookSourceGroup?: string
  enabled?: boolean
  searchUrl?: string
  exploreUrl?: string
}

// ====== 状态 ======
const sources = ref<BookSource[]>([])
const loading = ref(false)
const searchKeyword = ref('')

// ====== 表格列定义 ======
const columns: DataTableColumns<BookSource> = [
  {
    title: '名称',
    key: 'bookSourceName',
    width: 200,
    ellipsis: { tooltip: true },
  },
  {
    title: '分组',
    key: 'bookSourceGroup',
    width: 120,
    render(row) {
      return row.bookSourceGroup || '-'
    },
  },
  {
    title: 'URL',
    key: 'bookSourceUrl',
    ellipsis: { tooltip: true },
  },
  {
    title: '操作',
    key: 'actions',
    width: 150,
    render(row) {
      return h(NSpace, { size: 'small' }, () => [
        h(NButton, { 
          size: 'small',
          tertiary: true,
          onClick: () => testSource(row)
        }, () => '测试'),
        h(NPopconfirm, {
          onPositiveClick: () => deleteSource(row),
        }, {
          trigger: () => h(NButton, { 
            size: 'small',
            tertiary: true,
            type: 'error'
          }, () => '删除'),
          default: () => '确认删除此书源？'
        }),
      ])
    },
  },
]

// ====== 计算属性 ======
import { computed, h } from 'vue'

const filteredSources = computed(() => {
  if (!searchKeyword.value) return sources.value
  const keyword = searchKeyword.value.toLowerCase()
  return sources.value.filter(
    s => s.bookSourceName.toLowerCase().includes(keyword) ||
         s.bookSourceUrl.toLowerCase().includes(keyword) ||
         (s.bookSourceGroup || '').toLowerCase().includes(keyword)
  )
})

// ====== 方法 ======

// 加载书源列表
async function loadSources() {
  loading.value = true
  try {
    const res = await $get<BookSource[]>('/getBookSources')
    if (res.isSuccess) {
      sources.value = res.data
    } else {
      message.error(res.errorMsg || '加载书源失败')
    }
  } catch (error) {
    message.error('加载书源失败')
  } finally {
    loading.value = false
  }
}

// 测试书源
async function testSource(source: BookSource) {
  message.info(`测试书源: ${source.bookSourceName}`)
  // TODO: 实现书源测试
}

// 删除书源
async function deleteSource(source: BookSource) {
  try {
    const res = await $post('/deleteBookSource', { 
      bookSourceUrl: source.bookSourceUrl 
    })
    if (res.isSuccess) {
      message.success('删除成功')
      loadSources()
    } else {
      message.error(res.errorMsg || '删除失败')
    }
  } catch (error) {
    message.error('删除书源失败')
  }
}

// 返回首页
function goHome() {
  router.push('/')
}

// 初始化
onMounted(() => {
  loadSources()
})
</script>

<template>
  <NLayout class="min-h-screen bg-surface dark:bg-surface-dark">
    <!-- 顶部栏 -->
    <NLayoutHeader
      bordered
      class="h-16 flex items-center justify-between px-6 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm sticky top-0 z-10"
    >
      <div class="flex items-center gap-4">
        <NButton quaternary @click="goHome">
          <span class="text-lg">←</span>
        </NButton>
        <h1 class="text-lg font-semibold">书源管理</h1>
        <NTag type="info">{{ sources.length }} 个书源</NTag>
      </div>

      <NSpace>
        <NInput
          v-model:value="searchKeyword"
          placeholder="搜索书源..."
          clearable
          style="width: 200px"
        />
        <NButton @click="loadSources">刷新</NButton>
      </NSpace>
    </NLayoutHeader>

    <!-- 内容区 -->
    <NLayoutContent class="p-6">
      <NSpin :show="loading">
        <NDataTable
          v-if="filteredSources.length > 0"
          :columns="columns"
          :data="filteredSources"
          :bordered="false"
          :single-line="false"
          striped
          :row-key="(row: BookSource) => row.bookSourceUrl"
          max-height="calc(100vh - 180px)"
        />
        
        <NEmpty
          v-else-if="!loading"
          description="暂无书源"
          class="py-20"
        >
          <template #extra>
            <NButton type="primary">导入书源</NButton>
          </template>
        </NEmpty>
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
