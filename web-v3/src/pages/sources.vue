<script setup lang="ts">
/**
 * 书源管理页面 - shadcn-vue
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { 
  ArrowLeft, Search, RefreshCw, Database, 
  Play, Trash2, Upload 
} from 'lucide-vue-next'
import { $get, $post } from '@/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { SkeletonLoader } from '@/components/ui'
import { useMessage } from '@/composables/useMessage'

const router = useRouter()
const { success, error } = useMessage()

interface BookSource {
  bookSourceName: string
  bookSourceUrl: string
  bookSourceGroup?: string
  enabled?: boolean
}

const sources = ref<BookSource[]>([])
const loading = ref(true)
const searchKeyword = ref('')

const filteredSources = computed(() => {
  if (!searchKeyword.value) return sources.value
  const keyword = searchKeyword.value.toLowerCase()
  return sources.value.filter(s =>
    s.bookSourceName.toLowerCase().includes(keyword) ||
    s.bookSourceUrl.toLowerCase().includes(keyword) ||
    (s.bookSourceGroup || '').toLowerCase().includes(keyword)
  )
})

const groupStats = computed(() => {
  const groups: Record<string, number> = {}
  sources.value.forEach(s => {
    const group = s.bookSourceGroup || '未分组'
    groups[group] = (groups[group] || 0) + 1
  })
  return Object.entries(groups).sort((a, b) => b[1] - a[1])
})

async function loadSources() {
  loading.value = true
  try {
    const res = await $get<BookSource[]>('/getBookSources')
    if (res.isSuccess) {
      sources.value = res.data
    }
  } catch (e) {
    error('加载书源失败')
  } finally {
    loading.value = false
  }
}

async function testSource(source: BookSource) {
  success(`测试: ${source.bookSourceName}`)
}

async function deleteSource(source: BookSource) {
  if (!confirm(`确定删除书源「${source.bookSourceName}」？`)) return
  try {
    const res = await $post('/deleteBookSource', {
      bookSourceUrl: source.bookSourceUrl,
    })
    if (res.isSuccess) {
      sources.value = sources.value.filter(s => s.bookSourceUrl !== source.bookSourceUrl)
      success('删除成功')
    }
  } catch (e) {
    error('删除失败')
  }
}

function goBack() {
  router.push('/')
}

onMounted(() => {
  loadSources()
})
</script>

<template>
  <div class="min-h-screen bg-background">
    <!-- 导航栏 -->
    <header class="sticky top-0 z-50 w-full bg-background/95 backdrop-blur">
      <div class="container flex h-14 max-w-screen-2xl items-center justify-between px-4">
        <div class="flex items-center gap-4">
          <Button variant="ghost" size="icon" @click="goBack">
            <ArrowLeft class="h-4 w-4" />
          </Button>
          <div>
            <h1 class="font-semibold">书源管理</h1>
            <p class="text-xs text-muted-foreground">{{ sources.length }} 个书源</p>
          </div>
        </div>
        
        <div class="flex items-center gap-2">
          <div class="relative">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              v-model="searchKeyword"
              placeholder="搜索书源..."
              class="w-48 pl-9"
            />
          </div>
          
          <Button variant="ghost" size="icon" :class="{ 'animate-spin': loading }" @click="loadSources">
            <RefreshCw class="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
    
    <!-- 主内容 -->
    <main class="container max-w-screen-2xl px-4 py-6">
      <!-- 分组统计 -->
      <div v-if="groupStats.length > 0" class="mb-6 flex flex-wrap gap-2">
        <Badge
          v-for="[group, count] in groupStats.slice(0, 8)"
          :key="group"
          variant="secondary"
          class="cursor-pointer"
        >
          {{ group }} ({{ count }})
        </Badge>
      </div>
      
      <!-- 加载 -->
      <div v-if="loading" class="space-y-3">
        <SkeletonLoader v-for="i in 10" :key="i" type="text" :lines="1" />
      </div>
      
      <!-- 列表 -->
      <div v-else-if="filteredSources.length > 0" class="rounded-lg border">
        <div
          v-for="(source, index) in filteredSources"
          :key="source.bookSourceUrl"
          class="flex items-center justify-between p-4 hover:bg-accent/50 transition-colors"
          :class="{ 'border-t': index > 0 }"
        >
          <div class="min-w-0 flex-1">
            <h3 class="font-medium text-sm truncate">{{ source.bookSourceName }}</h3>
            <p class="text-xs text-muted-foreground truncate mt-0.5">{{ source.bookSourceUrl }}</p>
          </div>
          
          <div class="flex items-center gap-2 ml-4">
            <Badge v-if="source.bookSourceGroup" variant="outline" class="text-xs">
              {{ source.bookSourceGroup }}
            </Badge>
            
            <Button variant="ghost" size="icon" class="h-8 w-8" @click="testSource(source)">
              <Play class="h-3 w-3" />
            </Button>
            
            <Button variant="ghost" size="icon" class="h-8 w-8 text-destructive" @click="deleteSource(source)">
              <Trash2 class="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
      
      <!-- 空状态 -->
      <div v-else class="flex flex-col items-center justify-center py-24">
        <div class="rounded-full bg-muted p-6 mb-6">
          <Database class="h-12 w-12 text-muted-foreground" />
        </div>
        <h2 class="text-lg font-semibold mb-2">暂无书源</h2>
        <p class="text-muted-foreground mb-6">导入书源以开始使用</p>
        <Button>
          <Upload class="h-4 w-4 mr-2" />
          导入书源
        </Button>
      </div>
    </main>
  </div>
</template>
